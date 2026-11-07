"""Independent C03 craft pilot. Blender 5.1, metres, +Z up / +X door.

Run headless with two threads. Exports Y-up exactly once. Source geometry is
editable; runtime batches are derived copies. Original collision stays immutable.
"""
from pathlib import Path
import bpy, bmesh, hashlib, json, math, struct, sys, zlib
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / 'public/assets/world/scenario-craft-pilot'
SKILL = Path('/Users/a22309/.codex/skills/blender-material-craft')
sys.path.insert(0, str(SKILL / 'scripts'))
from scenario_tools import tool

P = dict(L=3.0, W=1.6, hw=.6, hr=3.0, dw=.70, dh=2.25,
         jamb=1.70, topw=.32, Xh=2.1, Yh=2.75, H=3.3,
         ovx=.16, ovs=.13, t=.07, win=(.36, 1.32, 1.74))
PARTS = []
MATS = {}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def png(path, rgb):
    a = np.uint8(np.clip(rgb, 0, 1) * 255 + .5)
    h, w, _ = a.shape
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    raw = b''.join(b'\0' + row.tobytes() for row in a)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w,h,8,2,0,0,0)) + chunk(b'IDAT', zlib.compress(raw,9)) + chunk(b'IEND',b''))


def make_maps():
    d = OUT / 'textures'; d.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:512,0:512] / 512
    # A 0.5 m repeat: 64 doubled yarns, with restrained unbleached variation.
    warp = np.cos(x*math.tau*64); weft = np.cos(y*math.tau*64)
    relief = .48*warp + .48*weft + .12*np.sin(x*math.tau*8+y*math.tau*5)
    broad = .014*np.sin(x*math.tau*3+y*math.tau*2) + .009*np.cos(y*math.tau*7)
    cloth = np.array([.91,.49,.245])[None,None,:]*(1 + broad[:,:,None] + .013*relief[:,:,None])
    png(d/'canvas_baseColor.png', cloth)
    rough = np.clip(.86 + .025*relief + broad,0,1)
    png(d/'canvas_roughness.png', np.repeat(rough[:,:,None],3,axis=2))
    dx = .13*np.sin(x*math.tau*64); dy = .13*np.sin(y*math.tau*64)
    normal = np.stack([dx,dy,np.ones_like(dx)],axis=2); normal /= np.linalg.norm(normal,axis=2)[:,:,None]
    png(d/'canvas_normal.png', normal*.5+.5)
    # Axial UVs on poles, authored longitudinal grain; this is not a scan.
    grain = .055*np.sin(x*math.tau*17+np.sin(y*math.tau)*.7)+.02*np.sin(x*math.tau*53+y*math.tau)
    wood = np.array([.63,.46,.29])[None,None,:]*(1+grain[:,:,None])
    png(d/'wood_baseColor.png',wood)
    png(d/'wood_roughness.png', np.repeat((.73+.025*grain)[:,:,None],3,axis=2))
    for f in d.glob('*.png'):
        im=bpy.data.images.load(str(f), check_existing=False)
        im.colorspace_settings.name = 'sRGB' if 'baseColor' in f.name else 'Non-Color'
        im.pack()


def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)


def material(key, name, color, rough, metal=0, maps=None):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=linear(color)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    m.diffuse_color=linear(color)
    if maps:
        uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
        for suffix,target in [('baseColor','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            path=OUT/'textures'/f'{maps}_{suffix}.png'
            if not path.exists():continue
            tx=m.node_tree.nodes.new('ShaderNodeTexImage');tx.image=next(im for im in bpy.data.images if Path(im.filepath).name==path.name)
            m.node_tree.links.new(uv.outputs['UV'],tx.inputs['Vector'])
            if target=='Normal':
                n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.uv_map='UVMap';n.inputs['Strength'].default_value=.38
                m.node_tree.links.new(tx.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],bs.inputs[target])
            else:m.node_tree.links.new(tx.outputs['Color'],bs.inputs[target])
        if maps=='canvas':
            # The orange image is shared. Cream/binding use a separate physical
            # base colour instead of multiplying a saturated orange image.
            if key!='canvas':
                for link in list(bs.inputs['Base Color'].links):m.node_tree.links.remove(link)
                for node in list(m.node_tree.nodes):
                    if node.type=='TEX_IMAGE' and 'baseColor' in node.image.name:m.node_tree.nodes.remove(node)
    MATS[key]=m;return m


def mesh(name, verts, faces, key, uv=None, smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);ASSET.objects.link(o);o.parent=ROOT;me.materials.append(MATS[key])
    layer=me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        p.use_smooth=smooth
        # Explicit physical-scale planar projection, where no fabrication UV is supplied.
        ax=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3)if i!=ax]
        for li in p.loop_indices:
            vi=me.loops[li].vertex_index;co=me.vertices[vi].co
            layer.data[li].uv=uv[vi] if uv is not None else (co[axes[0]]*2,co[axes[1]]*2)
    o['semantic']=name;o['materialFamily']=key;PARTS.append(o);return o


def grid_shell(name, fn, nu, nv, key, thickness=.018, smooth=True, uvfn=None, offset=None):
    v=[];uv=[]
    for k in (0,1):
        for i in range(nu+1):
            for j in range(nv+1):
                p=list(fn(i/nu,j/nv));delta=offset or (0,0,-thickness)
                p=[p[c]+k*delta[c]for c in range(3)];v.append(p)
                uv.append(uvfn(i/nu,j/nv) if uvfn else (i/nu,j/nv))
    n=(nu+1)*(nv+1);f=[]
    at=lambda i,j:i*(nv+1)+j
    for i in range(nu):
        for j in range(nv):
            a,b,c,d=at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)
            f.extend([(a,b,c,d),(d+n,c+n,b+n,a+n)])
    edges=[(at(i,0),at(i+1,0))for i in range(nu)]+[(at(i,nv),at(i+1,nv))for i in range(nu)]+[(at(0,j),at(0,j+1))for j in range(nv)]+[(at(nu,j),at(nu,j+1))for j in range(nv)]
    f.extend((a,b,b+n,a+n)for a,b in edges)
    return mesh(name,v,f,key,uv,smooth)


def tube(name, points, radius, key, sides=10, radii=None):
    pts=[Vector(p)for p in points];vs=[];uv=[]
    distance=0
    for i,p in enumerate(pts):
        direction=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        axis=Vector((1,0,0))if abs(direction.z)>.95 else Vector((0,0,1))
        u=direction.cross(axis).normalized();w=direction.cross(u).normalized()
        if i:distance+=(p-pts[i-1]).length
        r=radii[i]if radii else radius
        for j in range(sides):
            a=j*math.tau/sides;vs.append(tuple(p+r*(math.cos(a)*u+math.sin(a)*w)))
            uv.append((j/sides*math.tau*r*2,distance*2))
    fs=[tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))]
    for i in range(len(pts)-1):
        for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    return mesh(name,vs,fs,key,uv,True)


def prism(name, poly, offset, key):
    n=len(poly);v=list(poly)+[tuple(Vector(p)+Vector(offset))for p in poly]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
    return mesh(name,v,fs,key)


def roof(x,v,side):
    y=side*1.73*v
    # The roof stays within 4 cm of the original collider skin. Its cross section
    # reads as tensioned textile, with restrained scallop between sewn bays.
    z=3-1.5*abs(y)+.07-.046*math.sin(math.pi*v)
    z-=.023*math.sin(math.pi*(x+1.66)/3.32)**2*math.sin(math.pi*v)
    return (x,y,z)


def build():
    for side in (-1,1):
        grid_shell(f'fly_{side}_tensioned_canvas',lambda u,v:roof(-1.66+3.32*u,v,side),24,20,'canvas',.024,True,lambda u,v:(u*3.32*2,v*3.12*2))
        # A rounded bound eave and sewn gable edge replace the old square rods.
        for x,label in [(-1.66,'rear'),(1.66,'front')]:
            tube(f'{label}_rolled_hem_{side}',[roof(x,v/20,side)for v in range(21)],.021,'binding',8)
        tube(f'eave_rolled_hem_{side}',[roof(-1.66+i*3.32/24,1,side)for i in range(25)],.024,'binding',8)
        for x in (-.5,.5):
            tube(f'sewn_lapped_panel_{side}_{x}',[(a,b,c+.004)for a,b,c in [roof(x,v/20,side)for v in range(21)]],.008,'binding',6)
    tube('ridge_double_lapped_seam',[(-1.68,0,3.068),(0,0,3.076),(1.68,0,3.068)],.025,'binding',10)
    # Gables retain the original shoulder-height doorway, including a clear centre.
    top=[(1.6,.63),(.8,1.78),(0,3.03),(-.8,1.78),(-1.6,.63)]
    door=[(-.70,0),(-.70,1.70),(-.32,2.25),(.32,2.25),(.70,1.70),(.70,0)]
    front=[(-1.6,0)]+door+[(1.6,0)]+top
    prism('front_gable_open_door',[(1.45,y,z)for y,z in front],(.05,0,0),'canvas')
    prism('rear_gable', [(-1.5,y,z)for y,z in [(-1.6,0),(1.6,0)]+top],(.05,0,0),'canvas')
    for s in (-1,1):
        # Gently gathered low walls. Their fixed hem remains at the original footprint.
        grid_shell(f'low_sidewall_{s}',lambda u,v:(-1.5+3*u,s*(1.585-.012*math.sin(u*math.pi*8)*math.sin(v*math.pi)),.03+.59*v),24,5,'canvas',.025,True,lambda u,v:(u*6,v*1.18),offset=(0,-s*.025,0))
        prism(f'weather_skirt_{s}',[(-1.51,s*1.604,.025),(1.51,s*1.604,.025),(1.51,s*1.604,.18),(-1.51,s*1.604,.18)],(0,-s*.016,0),'binding')
        # Cuff-sized pleated curtains fit the original motion classifier and leave
        # every point of the 1.4 m opening clear.
        pts=[];r=[]
        for k in range(17):
            z=.08+1.62*k/16;cuff=math.exp(-((z-.85)/.19)**2)
            pts.append((1.518,s*.80,z));r.append(.075-.031*cuff)
        curtain=tube(f'gathered_curtain_{s}',pts,.075,'canvas',12,r)
        # Deliberate fluted profile rather than a smooth sausage.
        for i,vert in enumerate(curtain.data.vertices):
            ring,j=divmod(i,12);factor=1+.09*math.cos(j*math.tau/12*4)
            centre=Vector(pts[ring]);vert.co=centre+(vert.co-centre)*factor
        tube(f'curtain_cuff_{s}',[(1.518,s*.8,.82),(1.518,s*.8,.88)],.052,'cream',12)
        # Folded-back door lining has a cream edge at human eye height.
        edge=[(1.518,y,z+.035 if z==0 else z)for y,z in door]
        if s==1:tube('door_sewn_binding',edge,.019,'binding',8)
    # Rear mesh vent and a downward-facing rain flap sit on the actual back wall.
    prism('rear_vent_dark_inset',[(-1.523,y,z)for y,z in [(-.36,1.33),(.36,1.33),(.36,1.73),(-.36,1.73)]],(.012,0,0),'ground')
    prism('rear_vent_folded_rainflap',[(-1.553,y,z)for y,z in [(-.40,1.64),(.40,1.64),(.40,1.79),(-.40,1.79)]],(.026,0,0),'cream')
    # Groundsheet is thin, closed and grounded. It is neither a new platform nor
    # an additional collider.
    floor=prism('groundsheet_turned_edge',[(x,y,0)for x,y in [(-1.48,-1.58),(1.6,-1.58),(1.6,1.58),(-1.48,1.58)]],(0,0,.025),'ground')
    for s in (-1,1):
        tube(f'groundsheet_edge_{s}',[(-1.47,s*1.57,.035),(1.58,s*1.57,.035)],.012,'ground',8)
    # Timber load path is visible inside the door: no centre pole blocks entry.
    tube('ridge_support',[(-1.73,0,2.96),(1.73,0,2.96)],.052,'wood',12)
    tube('rear_upright',[(-1.38,0,.055),(-1.38,0,3.03)],.055,'wood',12)
    for s in (-1,1):
        shoulder=3-1.5*.84-.13
        tube(f'door_jamb_{s}',[(1.38,s*.84,.055),(1.38,s*.84,shoulder)],.05,'wood',12)
        tube(f'door_roof_brace_{s}',[(1.38,s*.84,shoulder-.035),(1.38,0,2.96)],.045,'wood',12)
        tube(f'jamb_lashing_{s}',[(1.38,s*.84,shoulder-.13),(1.38,s*.84,shoulder-.06)],.058,'cream',10)
    for x in (-1.38,1.38):
        tube(f'ridge_finial_{x}',[(x,0,2.9),(x,0,3.3)],.03,'wood',10,[.03,.008])
    # Four guy ropes and stakes stay inside the old cell. No fence of fittings.
    for sx in (-1,1):
        for sy in (-1,1):
            base=Vector((sx*1.97,sy*2.62,.015));tip=Vector((sx*2.002,sy*2.661,.3));knot=base.lerp(tip,.78)
            tube(f'stake_{sx}_{sy}',[base,tip],.035,'wood',10,[.035,.03])
            anchor=Vector(roof(sx*1.61,1,sy));anchor.z-=.03
            tube(f'braided_guy_{sx}_{sy}',[anchor,anchor.lerp(knot,.5)+Vector((0,0,-.012)),knot],.013,'cream',8)
            tube(f'eave_loop_{sx}_{sy}',[anchor-Vector((.035,0,0)),anchor+Vector((.035,0,0))],.019,'cream',8)


def bounds(objects):
    pts=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    return {'min':[min(p[i]for p in pts)for i in range(3)],'max':[max(p[i]for p in pts)for i in range(3)]}


def topology(objects):
    rows=[]
    for o in objects:
        bm=bmesh.new();bm.from_mesh(o.data)
        rows.append({'part':o.name,'vertices':len(bm.verts),'faces':len(bm.faces),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'degenerateFaces':sum(f.calc_area()<1e-10 for f in bm.faces)})
        bm.free()
    return rows


def build_runtime():
    runtime=bpy.data.collections.new('RUNTIME | material batches');bpy.context.scene.collection.children.link(runtime)
    r=bpy.data.objects.new('C03',None);runtime.objects.link(r)
    for key,value in ROOT.items():r[key]=value
    batches=[]
    for key,mat in MATS.items():
        original=[o for o in PARTS if o.data.materials[0]==mat]
        if not original:continue
        bpy.ops.object.select_all(action='DESELECT');copies=[]
        for o in original:
            c=o.copy();c.data=o.data.copy();c.parent=None;runtime.objects.link(c);c.select_set(True);copies.append(c)
        bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name=f'C03_pilot_{key}';o.parent=r;o['sourceParts']=[p.name for p in original];batches.append(o)
    bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
    for o in batches:o.select_set(True)
    glb=OUT/'C03-tent-v1.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_normals=True,export_animations=False,export_cameras=False,export_lights=False)
    runtime.hide_render=True;runtime.hide_viewport=True
    return glb,batches


def rig():
    col=bpy.data.collections.new('REVIEW RIG | offline only');bpy.context.scene.collection.children.link(col)
    def link(o):
        col.objects.link(o);return o
    cam=link(bpy.data.objects.new('ordinary_front_threequarter',bpy.data.cameras.new('ordinary')))
    cam.location=(7,-8,4.7);target=Vector((0,0,1.4));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=49;bpy.context.scene.camera=cam
    sun=link(bpy.data.objects.new('review_sun',bpy.data.lights.new('review_sun','SUN')));sun.rotation_euler=(.5,-.4,-.8);sun.data.energy=2
    area=link(bpy.data.objects.new('review_sky',bpy.data.lights.new('review_sky','AREA')));area.location=(1,-3,7);area.data.energy=380;area.data.shape='DISK';area.data.size=6
    area.rotation_euler=(Vector((0,0,1))-area.location).to_track_quat('-Z','Y').to_euler()
    sc=bpy.context.scene
    if sc.world is None:sc.world=bpy.data.worlds.new('Neutral review world')
    sc.world.color=(.16,.16,.16);sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=True
    sc.render.resolution_x=1100;sc.render.resolution_y=850;sc.render.resolution_percentage=100;sc.view_settings.view_transform='AgX'
    return sc


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);(HERE/'qa').mkdir(exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.unit_settings.system='METRIC'
    ASSET=bpy.data.collections.new('SOURCE | C03 crafted tent');bpy.context.scene.collection.children.link(ASSET)
    ROOT=bpy.data.objects.new('C03_source',None);ASSET.objects.link(ROOT)
    # Frozen exact runtime source, including its collision contract.
    baseline=HERE/'baseline-C03.glb'
    raw=baseline.read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    extras=next(n['extras']for n in g['nodes']if n.get('name')=='C03')
    for k,v in extras.items():ROOT[k]=v
    ROOT['pilot']='independent-sol-scenario-v1'
    make_maps()
    material('canvas','camp_canvas_orange','E8803A',.88,maps='canvas')
    material('binding','pilot_canvas_binding','AF5A2D',.9,maps='canvas')
    material('cream','pilot_canvas_cream','E6DCCB',.88,maps='canvas')
    material('wood','pilot_timber','B99469',.74,maps='wood')
    material('ground','pilot_groundsheet','514735',.95)
    build();bpy.context.view_layer.update()
    uvtool=tool('uv');mtool=tool('materials');ex=tool('export')
    # Tiling surfaces intentionally overlap. Texel density is the relevant
    # Scenario measurement; a unique bake-atlas overlap gate would be false.
    qa={'nativeTopology':topology(PARTS),'uvDensity':{o.name:uvtool.texel_density(o,tex_res=512)for o in PARTS if o.name in ('fly_1_tensioned_canvas','door_jamb_1')},'materialAudit':{m.name:mtool.audit_material(m)for m in MATS.values()},'nativeBoundsZUp':bounds(PARTS),'toolSelection':'UV density, PBR node audit, GLB summary; no unneeded remesh or unique atlas'}
    glb,batches=build_runtime();qa['glbSummary']=ex.glb_summary(str(glb));qa['runtimeTopology']=topology(batches)
    (HERE/'qa'/'raw-author-qa.json').write_text(json.dumps(qa,indent=2))
    rig();bpy.context.preferences.filepaths.save_version=0
    blend=HERE/'C03-tent-editable.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    manifest={'asset':'C03','candidate':'independent-sol-scenario-v1','sourceRevision':'4f4f386b345df93449cfd08c392e948c8b85f9b2','baselineSha256':digest(baseline),'glbSha256':digest(glb),'blendSha256':digest(blend),'generatorSha256':digest(__file__),'dimensionsM_ZUp':qa['nativeBoundsZUp'],'runtime':qa['glbSummary'],'textures':[{'file':str(p.relative_to(OUT)),'sha256':digest(p),'size':[512,512],'license':'CC0, original deterministic author generation; not photographed scans'}for p in sorted((OUT/'textures').glob('*.png'))],'contract':{'position':[-42,4.8,12.5],'yaw':-math.pi/2,'front':'+X local -> +Z world','physics':'Original baseline camp-tent-shell-v2 remains the only collider','doorProfile':extras['doorProfile'],'tentParams':json.loads(extras['tentParams']),'identityAnchor':[-42.4,5.6,14.75]},'status':{'offlineQA':'raw reports retained; review required','runtimeVisual':'not reviewed','runtimePerformance':'not measured','userAcceptance':'pending'},'firstCompleteFrozen':True}
    (HERE/'first-complete-manifest.json').write_text(json.dumps(manifest,indent=2));(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print('FIRST_COMPLETE',json.dumps({'glb':str(glb),'glbSha256':digest(glb),'blendSha256':digest(blend),'triangles':qa['glbSummary']['triangles']}),flush=True)
