"""Rebuild only G25/G26/G27 native + GLB visuals with articulated cabin doors.

Run from repository root: Blender -b -t 1 -P tools/world/vehicles/build_doors.py -- [G25|G26|G27]
Source body vocabulary and wheels come from build_vehicle; far structure from build_lod.
Never writes collision JSON or legacy asset reports. All output reports use door-* names.
"""
import os, sys, json, math, hashlib, struct
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/vehicles'))
import vehlib as V
import build_vehicle as B
import build_lod as L

CONTRACT_PATH = os.path.join(V.SRC_DIR, 'door-contract.json')
with open(CONTRACT_PATH) as f: CONTRACT = json.load(f)
IDS = {'G25':'offroad', 'G26':'coupe', 'G27':'van'}
CONFIG = {
 'G25':dict(cabin=[(-.68,.55),(.53,.55),(.53,1.24),(.435,1.735),(-.68,1.735)], inner=.875,
   opening=[(-.43,.535),(.605,.535),(.605,1.23),(.495,1.775),(-.43,1.775)], belt=1.205, paint='veh_paint_slate',
   window=[(-.365,1.27),(.485,1.27),(.40,1.71),(-.365,1.71)],floor=.55),
 'G26':dict(cabin=[(-1.06,.17),(.55,.17),(.55,.795),(.04,1.235),(-.52,1.225),(-1.06,1.07)],inner=.78,
   opening=[(-.81,.34),(.625,.34),(.625,.79),(.075,1.255),(-.53,1.235),(-.81,1.16)],belt=.81,paint='veh_paint_cream',
   window=[(-.75,.855),(.47,.855),(.035,1.195),(-.50,1.175),(-.75,1.10)],floor=.17,floor_start=-.73),
 'G27':dict(cabin=[(.95,.79),(2.04,.79),(2.04,1.16),(1.54,1.955),(.95,1.955)],inner=.985,
   opening=[(.995,.755),(1.985,.755),(1.985,1.20),(1.565,1.975),(.995,1.975)],belt=1.18,paint='veh_paint_cream',
   window=[(1.065,1.25),(1.85,1.25),(1.51,1.90),(1.065,1.90)],floor=.79),
}

def digest(p):
    with open(p,'rb') as f:return hashlib.sha256(f.read()).hexdigest()

def to_blender(p):return Vector((p[0],-p[2],p[1]))

def shell_object(poly, d0, d1, name):
    p=V.Part(name);bm,_=V.prism(poly,lambda u,v,d:(u,d,v),d0,d1);p.add(bm,'veh_accent_dark')
    return V.make_object(p,None)

def difference_components(body, cutters):
    """Operate on individual closed shells, avoiding union assumptions across decorative shells."""
    bm=bmesh.new();bm.from_mesh(body.data);seen=set();shells=[]
    for seed in bm.verts:
        if seed in seen:continue
        todo=[seed];seen.add(seed);verts=[]
        while todo:
            v=todo.pop();verts.append(v)
            for e in v.link_edges:
                w=e.other_vert(v)
                if w not in seen:seen.add(w);todo.append(w)
        faces={f for v in verts for f in v.link_faces}
        shells.append((verts,faces))
    out=bmesh.new();changed=0
    cutter_bounds=[(tuple(min(v.co[i] for v in c.data.vertices) for i in range(3)),tuple(max(v.co[i] for v in c.data.vertices) for i in range(3))) for c in cutters]
    for index,(verts,faces) in enumerate(shells):
        lo=tuple(min(v.co[i] for v in verts) for i in range(3));hi=tuple(max(v.co[i] for v in verts) for i in range(3))
        relevant=[c for c,(cl,ch) in zip(cutters,cutter_bounds) if all(lo[i]<ch[i] and hi[i]>cl[i] for i in range(3))]
        sb=bmesh.new();vm={v:sb.verts.new(v.co) for v in verts}
        for f in faces:
            sf=sb.faces.new([vm[v] for v in f.verts]);sf.material_index=f.material_index
        me=bpy.data.meshes.new('cut-shell');sb.to_mesh(me);sb.free()
        if relevant:
            ob=bpy.data.objects.new('cut-shell',me);bpy.context.scene.collection.objects.link(ob)
            for m in body.data.materials:me.materials.append(m)
            bpy.context.view_layer.objects.active=ob
            for cutter in relevant:
                mod=ob.modifiers.new('actual-cabin-aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
                bpy.ops.object.modifier_apply(modifier=mod.name)
            src=ob.data;changed+=1
        else:src=me
        add=bmesh.new();add.from_mesh(src);vm2={v:out.verts.new(v.co) for v in add.verts}
        for f in add.faces:
            nf=out.faces.new([vm2[v] for v in f.verts]);nf.material_index=f.material_index
        add.free()
        if relevant:bpy.data.objects.remove(ob,do_unlink=True)
        if me.users==0:bpy.data.meshes.remove(me)
    # Remove redundant coplanar Boolean diagonals before stable ear triangulation.
    # Material boundaries and every noncoplanar silhouette edge remain protected.
    bmesh.ops.dissolve_limit(out,angle_limit=1e-5,verts=list(out.verts),edges=list(out.edges),delimit={'MATERIAL'})
    bmesh.ops.triangulate(out,faces=list(out.faces),quad_method='BEAUTY',ngon_method='EAR_CLIP')
    for _ in range(8):
        tiny=[f for f in out.faces if len(f.verts)==3 and (f.verts[1].co-f.verts[0].co).cross(f.verts[2].co-f.verts[0].co).length*.5<1e-8]
        if not tiny:break
        mids=set()
        for face in tiny:
            longest=max(face.edges,key=lambda e:e.calc_length())
            mids.update(v for v in face.verts if v not in longest.verts)
        bmesh.ops.dissolve_verts(out,verts=list(mids),use_face_split=False,use_boundary_tear=False)
        bmesh.ops.triangulate(out,faces=list(out.faces),quad_method='BEAUTY',ngon_method='EAR_CLIP')
    out.verts.index_update();duplicates={}
    for face in out.faces:
        duplicates.setdefault(tuple(sorted(v.index for v in face.verts)),[]).append(face)
    # Collinear dissolution can expose a zero-volume opposed triangle pair.
    # Drop both coincident faces, never a single material-bearing exterior face.
    paired=[f for group in duplicates.values() if len(group)==2 for f in group]
    if paired:bmesh.ops.delete(out,geom=paired,context='FACES_ONLY')
    wires=[e for e in out.edges if not e.link_faces]
    if wires:bmesh.ops.delete(out,geom=wires,context='EDGES')
    loose=[v for v in out.verts if not v.link_faces]
    if loose:bmesh.ops.delete(out,geom=loose,context='VERTS')
    out.to_mesh(body.data);out.free();bm.free()
    for c in cutters:bpy.data.objects.remove(c,do_unlink=True)
    return changed

def plane(asset,z):
    if asset=='G25':return .98 if z<=1.22 else .971-.09*(z-1.19)
    if asset=='G26':return .95-max(0,z-.70)*.35 if z<=.81 else .86-(z-.79)*.55
    return 1.10 if z<=1.18 else 1.092-max(0,z-1.12)*.06

def clip_low(poly,height):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if a[1]<=height:out.append(a)
        if (a[1]<=height)!=(b[1]<=height):
            t=(height-a[1])/(b[1]-a[1]);out.append((a[0]+t*(b[0]-a[0]),height))
    return out

def append_mesh(body, part):
    ob=V.make_object(part,body.parent)
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);ob.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()

def coupe_greenhouse(source, extract):
    """Keep the authored curved greenhouse instead of a sagging far n-gon chord."""
    bm=bmesh.new();bm.from_mesh(source.data);seen=set();green=set()
    for seed in bm.verts:
        if seed in seen:continue
        todo=[seed];seen.add(seed);verts=[]
        while todo:
            v=todo.pop();verts.append(v)
            for e in v.link_edges:
                w=e.other_vert(v)
                if w not in seen:seen.add(w);todo.append(w)
        lo=[min(v.co[i] for v in verts) for i in range(3)];hi=[max(v.co[i] for v in verts) for i in range(3)]
        if lo[0]<-1.80 and hi[0]>.65 and lo[2]>.78 and hi[2]>1.285:green.update(verts)
    assert green,'authored greenhouse shell not found'
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if (v not in green if extract else v in green)],context='VERTS')
    if extract:
        for v in bm.verts:v.co.z=min(v.co.z,1.29)
        me=bpy.data.meshes.new('authored-far-greenhouse');bm.to_mesh(me)
        for material in source.data.materials:me.materials.append(material)
        ob=bpy.data.objects.new('authored-far-greenhouse',me);bpy.context.scene.collection.objects.link(ob);ob.parent=source.parent
        bm.free();return ob
    bm.to_mesh(source.data);bm.free()

def add_interior(asset, body):
    cfg=CONFIG[asset];co=CONTRACT[IDS[asset]];x,y,z=co['seat'];p=V.Part('fixed-cabin-interior')
    # Narrow seat cushions support the known driver pelvis without filling the doorway.
    for s in (-1,1):
        cy=s*z
        assert cfg['floor']-.02 < y-.12, (asset,'inverted seat pedestal',cfg['floor'],y)
        assert cfg['floor'] < y-.13, (asset,'floor above cushion base',cfg['floor'],y)
        p.add(V.box((x-.25,cy-.22,y-.13),(x+.25,cy+.22,y),.025),'veh_accent_dark')
        p.add(V.box((x-.30,cy-.22,y-.04),(x-.23,cy+.22,y+.39),.025),'veh_accent_dark')
        p.add(V.box((x-.31,cy-.13,y+.34),(x-.21,cy+.13,y+.49),.025),'veh_accent_dark')
        p.add(V.box((x-.17,cy-.14,cfg['floor']-.02),(x+.14,cy+.14,y-.12)),'veh_metal_dark')
    # Low dashboard ahead of knees; roof and A-pillars retain the exterior source shape.
    dashx={'G25':.47,'G26':.45,'G27':1.83}[asset]
    dashz={'G25':1.16,'G26':.77,'G27':1.25}[asset]
    p.add(V.box((dashx-.10,-cfg['inner'],dashz-.11),(dashx+.08,cfg['inner'],dashz),.02),'veh_accent_dark')
    p.add(V.box((cfg.get('floor_start',x-.33),-cfg['inner'],cfg['floor']-.045),(dashx+.06,cfg['inner'],cfg['floor']),.008),'veh_accent_dark')
    for s in (-1,1):
        p.add(V.box((cfg['opening'][0][0],s*(cfg['inner']+.04)-.025,cfg['floor']-.03),(cfg['opening'][1][0],s*(cfg['inner']+.04)+.025,cfg['floor']+.025),.008),'veh_metal_dark')
    # Steering wheel, column and instrument slab live in the fixed cabin.
    cy=z
    wheel_center=(.30,cy,.81) if asset=='G26' else (dashx-.27,cy,dashz+.12)
    wheel_radius=.10 if asset=='G26' else .115
    column_end=wheel_center if asset=='G26' else (dashx-.28,cy,dashz+.12)
    p.add(V.cylinder((dashx-.08,cy,dashz-.01),column_end,.024,8),'veh_metal_dark')
    p.add(V.torus(wheel_center,(1,0,0),wheel_radius,.014,12,5),'veh_accent_dark')
    append_mesh(body,p)

def make_doors(asset,root):
    cfg=CONFIG[asset];co=CONTRACT[IDS[asset]];result=[]
    outer=V.offset_poly(cfg['opening'],.008)
    for side,name in ((-1,'door-left'),(1,'door-right')):
        # side is glTF Z, inverse of Blender Y.
        p=V.Part(name,smooth_angle=35)
        mapping=lambda u,v,d,side=side:(u,-side*(plane(asset,v)+d),v)
        lower=clip_low(outer,cfg['belt'])
        bm,_=V.prism(lower,mapping,-.042,.004);p.add(bm,cfg['paint'])
        # Closed window ring with a filled, attached pane; all exported as one rigid mesh.
        win=cfg['window'];frame=V.offset_poly(win,-.035)
        for i in range(len(win)):
            j=(i+1)%len(win)
            bm,_=V.prism([frame[i],frame[j],win[j],win[i]],mapping,-.035,.006);p.add(bm,cfg['paint'])
        bm,_=V.prism(win,mapping,-.017,-.004);p.add(bm,'veh_glass')
        # The waist joins the upper frame and lower skin across their profile transitions.
        xa=min(v[0] for v in lower);xb=max(v[0] for v in lower);waist=cfg['belt']
        bm,_=V.prism([(xa,waist-.02),(xb,waist-.02),(xb,waist+.055),(xa,waist+.055)],mapping,-.046,.002);p.add(bm,cfg['paint'])
        # Complete perimeter seal / edge return, inner lining and visible pull/outer handle.
        inner=V.offset_poly(outer,.025)
        for i in range(len(outer)):
            j=(i+1)%len(outer)
            bm,_=V.prism([outer[i],outer[j],inner[j],inner[i]],mapping,-.049,-.035);p.add(bm,'veh_accent_dark')
        lo=min(v[1] for v in lower);hx=xa+.17;hz=waist-.14
        lining=[(xa+.07,lo+.07),(xb-.07,lo+.07),(xb-.07,waist-.065),(xa+.07,waist-.065)]
        bm,_=V.prism(lining,mapping,-.051,-.044);p.add(bm,'veh_accent_dark')
        for depth in ((.006,.025),(-.071,-.052)):
            bm,_=V.prism([(hx-.06,hz-.013),(hx+.06,hz-.013),(hx+.06,hz+.013),(hx-.06,hz+.013)],mapping,*depth);p.add(bm,'veh_metal_dark')
        ob=V.make_object(p,root)
        hinge=to_blender((co['hinge'][0],co['hinge'][1],side*co['hinge'][2]))
        for v in ob.data.vertices:v.co-=hinge
        ob.location=hinge;ob['partRole']='articulated-door';ob['doorSide']=name[5:];ob['openAngle']=co['angle']
        axis=co['axis'];actual=axis if side>0 else [-axis[0],-axis[1],axis[2]]
        ob['openingAxis']=actual;result.append(ob)
    return result

def bvh(ob):
    me=ob.data;me.calc_loop_triangles();return BVHTree.FromPolygons([ob.matrix_world@v.co for v in me.vertices],[list(t.vertices) for t in me.loop_triangles],all_triangles=True)

def witnesses(asset,body,doors):
    cfg=CONFIG[asset];co=CONTRACT[IDS[asset]];tree=bvh(body);rays=[]
    # Bidirectional short side rays stop at cabin space, before seat/interior contact.
    x=co['standingX']; low=max(cfg['floor']+.10,min(p[1] for p in cfg['opening'])+.06);upper={'G25':1.64,'G26':1.08,'G27':1.81}[asset]
    for side in (-1,1):
        for xx in [x-.12,x,x+.12]:
            for z in [low,(low+upper)/2,upper]:
                origin=Vector((xx,-side*1.5,z));direction=Vector((0,side,0));dist=1.5-cfg['inner']+.005
                hit=tree.ray_cast(origin,direction,dist)[0]
                rays.append(dict(side=side,x=xx,height=z,clear=hit is None,hit=list(hit) if hit else None))
    motion=[];open_corridor=[]
    for ob in doors:
        axis=to_blender(ob['openingAxis']).normalized();base=ob.matrix_world.copy();side=1 if ob.name=='door-right' else -1
        # Track actual rear lower leaf corner; axis rotation in ground space.
        corner=min(ob.data.vertices,key=lambda v:v.co.x+abs(v.co.z)*.01).co.copy();before=base@corner
        samples=[]
        for frac in (0,.25,.5,.75,1):
            rot=Matrix.Rotation(co['angle']*frac,4,axis);after=ob.location+rot.to_3x3()@corner
            samples.append(dict(fraction=frac,point=V.to_gltf(after),rise=after.z-before.z,outward=-side*(after.y-before.y)))
        motion.append(dict(door=ob.name,hinge=V.to_gltf(ob.location),samples=samples))
        # Entire fully-open door, with glass/frame/lining, must clear the transfer ray.
        rot=Matrix.Rotation(co['angle'],4,axis)
        me=ob.data;me.calc_loop_triangles()
        opened=BVHTree.FromPolygons([ob.location+rot.to_3x3()@v.co for v in me.vertices],[list(t.vertices) for t in me.loop_triangles],all_triangles=True)
        for xx in (x-.10,x,x+.10):
            for zz in (low,(low+upper)/2,upper):
                origin=Vector((xx,-side*2.4,zz));hit=opened.ray_cast(origin,Vector((0,side,0)),2.4-cfg['inner']+.01)[0]
                open_corridor.append(dict(door=ob.name,x=xx,height=zz,clear=hit is None,hit=list(hit) if hit else None))
    assert all(r['clear'] for r in rays),[r for r in rays if not r['clear']]
    assert all(m['samples'][-1]['outward']>.35 for m in motion),motion
    if asset=='G26':assert all(m['samples'][-1]['rise']>.6 for m in motion),motion
    assert all(r['clear'] for r in open_corridor),[r for r in open_corridor if not r['clear']]
    seat=co['seat'];ceiling=[]
    for sx in (seat[0]-.1,seat[0],seat[0]+.1):
        for side in (-1,1):
            origin=Vector((sx,-side*seat[2],seat[1]+.14))
            hit=tree.ray_cast(origin,Vector((0,0,1)),3)[0]
            assert hit is not None,(asset,'roof missing above seat',sx,side)
            ceiling.append(dict(seatSide=side,x=sx,ceilingY=hit.z,abovePosterior=hit.z-seat[1]))
    support=dict(floorY=cfg['floor'],cushionTopY=seat[1],cushionBottomY=seat[1]-.13,pedestalBottomY=cfg['floor']-.02,pedestalTopY=seat[1]-.12,cushionHalfWidth=.22,seatCenterSideZ=seat[2],betweenCushions=2*seat[2]-.44,apertureSillY=min(p[1] for p in cfg['opening']),ceilingSamples=ceiling)
    return dict(apertureSideRays=rays,openDoorTransferRays=open_corridor,doorMotion=motion,seatSupport=support,scope='Finite surface rays into clear side corridor and five sampled rear-corner poses; not exhaustive all-mesh continuous collision proof.')

def build(asset,lod):
    V.DRACO['export_draco_position_quantization']=20 if lod else 16
    V.reset_scene();spec=B.BUILDERS[asset]();root=bpy.data.objects.new(asset,None);bpy.context.scene.collection.objects.link(root)
    body=V.make_object(spec['body'],root)
    greenhouse=coupe_greenhouse(body,True) if lod and asset=='G26' else None
    if lod:body,_=L.reduce_body(body)
    baseline_body=V.evaluated_tris(body)
    if greenhouse:
        coupe_greenhouse(body,False)
        bpy.ops.object.select_all(action='DESELECT');body.select_set(True);greenhouse.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
    w=spec['wheel'];wp=L.far_wheel(asset,spec['R'],w['width']) if lod else V.build_wheel(asset+'_wheel',spec['R'],w['width'],w['rim_r'],w['spokes'],w['rim'],w['hub'],segs=w['segs'],tread=w.get('tread'),steel=w.get('steel',False),spoke_w=w.get('spoke_w',.032))
    wheel=V.make_object(wp,root);data=wheel.data;bpy.data.objects.remove(wheel,do_unlink=True);wheels=[]
    for name,x,s in [('wheel-front-right',spec['AX'],-1),('wheel-front-left',spec['AX'],1),('wheel-rear-right',-spec['AX'],-1),('wheel-rear-left',-spec['AX'],1)]:
        ob=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(ob);ob.parent=root;ob.location=(x,s*spec['TRACK'],spec['R'])
        if s<0:ob.rotation_euler=(0,0,math.pi)
        wheels.append(ob)
    bpy.context.view_layer.update();baseline=baseline_body+sum(V.evaluated_tris(o) for o in wheels)
    cfg=CONFIG[asset]
    # Door apertures only cut the lateral walls. Keeping their cutter out of
    # the central roof preserves the authored roof even on reduced far meshes.
    band_start={'G25':.70,'G26':.50,'G27':.80}[asset]
    cutters=[shell_object(cfg['cabin'],-cfg['inner'],cfg['inner'],'cabin-hollow'),
             shell_object(cfg['opening'],-1.22,-band_start,'left-side-doorway'),
             shell_object(cfg['opening'],band_start,1.22,'right-side-doorway')]
    changed=difference_components(body,cutters);add_interior(asset,body);doors=make_doors(asset,root);bpy.context.view_layer.update();objs=[body]+wheels+doors
    with open(V.HULL_JSON) as f:collider=json.load(f)[asset]
    for key in ('bodyY','clip','wheelRadius','wheelWidth'):root[key]=collider[key]
    root['collisionHulls']=json.dumps(collider['hulls']);root['collisionSchema']='vehicle-hulls-v1';root['assetId']=asset;root['generator']='vehicles-doors-r1';root['lod']=lod;root['doorContract']=json.dumps(CONTRACT[IDS[asset]])
    checks={o.name:V.mesh_checks(o) for o in [body]+doors};tris={o.name:V.evaluated_tris(o) for o in objs};bounds=list(V.world_bounds(objs));evidence=witnesses(asset,body,doors)
    if checks[body.name]['degenerate']:
        print('[tiny]',[(t.area,[list(body.data.vertices[i].co) for i in t.vertices]) for t in body.data.loop_triangles if t.area<1e-8],flush=True)
    if checks[body.name]['nonManifoldEdges']:
        diagnostic=bmesh.new();diagnostic.from_mesh(body.data)
        print('[nonmanifold]',[(len(e.link_faces),[list(v.co) for v in e.verts],[[(list(v.co)) for v in f.verts] for f in e.link_faces]) for e in diagnostic.edges if not e.is_manifold],flush=True)
        diagnostic.free()
    assert all(c['finite'] and c['signedVolume']>0 and c['degenerate']==0 and c['nonManifoldEdges']==0 for c in checks.values()),checks
    name=asset+('-lod1' if lod else '');glb=V.export_glb(name,root,objs);native=os.path.join(V.BLEND_DIR,name+'.blend')
    if asset=='G26' and not lod:
        bpy.ops.export_scene.gltf(filepath='/tmp/vehicle-door-G26-uncompressed.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_materials='EXPORT',export_texcoords=False,export_tangents=False,export_cameras=False,export_lights=False,export_animations=False,export_extras=True,export_draco_mesh_compression_enable=False)
    back=V.reimport_check(glb)
    assert sum(back['tris'].values())==sum(tris.values()),(tris,back)
    assert back['bounds']==bounds,(bounds,back['bounds'])
    imported={o.name:o for o in bpy.context.scene.objects};evidence_back=witnesses(asset,imported[asset+'_body'],[imported['door-left'],imported['door-right']])
    bpy.ops.wm.open_mainfile(filepath=native)
    native_tris=sum(V.evaluated_tris(o) for o in bpy.context.scene.objects if o.type=='MESH')
    assert native_tris==sum(tris.values())
    right=bpy.data.objects['door-right']
    # Explicitly map Blender local xyz -> glTF local x,z,-y.
    right_points=[Vector((v.co.x,v.co.z,-v.co.y)) for v in right.data.vertices]
    door_bounds=dict(min=[min(p[i] for p in right_points) for i in range(3)],max=[max(p[i] for p in right_points) for i in range(3)])
    report=dict(asset=asset,lod=lod,blender=bpy.app.version_string,baselineTris=baseline,totalTris=sum(tris.values()),deltaRatio=sum(tris.values())/baseline-1,triangles=tris,bounds=bounds,doorBounds=door_bounds,checks=checks,modifiedClosedShells=changed,nativeSha256=digest(native),glbSha256=digest(glb),bytes=os.path.getsize(glb),reimport=back,nativeReopenTriangles=native_tris,witnesses=evidence,freshImportWitnesses=evidence_back,contract=CONTRACT[IDS[asset]])
    out=os.path.join(V.DOC_DIR,'door-'+name+'-report.json');os.makedirs(V.DOC_DIR,exist_ok=True)
    with open(out,'w') as f:json.dump(report,f,indent=2)
    print('[doors]',name,'triangles',sum(tris.values()),'baseline',baseline,'bounds',bounds,flush=True)
    return report

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    assets=args[:1] if args and args[0] in IDS else list(IDS)
    frozen=digest(V.HULL_JSON)
    for asset in assets:
        for lod in (0,1):build(asset,lod)
    assert digest(V.HULL_JSON)==frozen,'collider JSON was changed'
