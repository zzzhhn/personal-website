"""One bounded native build / fresh GLB QA / local preview job for batch 1.
Run from this checkout with existing Blender, factory startup and --threads 2.
"""
import bpy, bmesh, math, json, hashlib, sys, struct
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from layout import OUT, VEINS, POOL, RACK, LAMPS, ore_rest
from geometry import build_geometry, write_proxies, rock_color
import grain

EVIDENCE=HERE/'evidence';SOURCE=HERE/'batch1.blend';GLB=OUT/'quarry-static.glb'
PALETTE={'stone':(.94,0),'ground':(.99,0),'wood':(.84,0),'metal':(.67,.35),'canvas':(.96,0),'glow':(.34,0)}
def v3(p):return (p[0],-p[2],p[1])
def linear(h):
    cs=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in cs)+(1,)
def material(role):
    m=bpy.data.materials.get('AM_'+role)
    if m:return m
    m=bpy.data.materials.new('AM_'+role);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Roughness'].default_value=PALETTE[role][0];bs.inputs['Metallic'].default_value=PALETTE[role][1]
    vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Col';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
    if role=='glow':
        m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=2.5
    if role in ['stone','ground']:grain.link(m,vc,bs)
    m['materialRole']=role;m.use_backface_culling=True
    if role=='foliage':m.use_backface_culling=False
    return m

def create_source(scene):
    root=bpy.data.objects.new('AM_author',None);scene.collection.objects.link(root)
    for data in build_geometry().values():
        me=bpy.data.meshes.new(data.name);me.from_pydata([v3(p) for p in data.vertices],[],data.faces);me.update()
        me.materials.append(material(data.material));col=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
        for poly,color in zip(me.polygons,data.colors):
            for idx in poly.loop_indices:
                if data.material=='stone' and data.name.startswith(('AM01_rock_mass','AM01_primary','AM01_attached','AM06_east','AM06_rear')):
                    x,y,z=data.vertices[me.loops[idx].vertex_index];color=rock_color(y,0,x,z)
                col.data[idx].color=linear(color)
        ob=bpy.data.objects.new(data.name,me);scene.collection.objects.link(ob);ob.parent=root;ob['materialRole']=data.material;ob['semantic']=data.semantic
        # Applied small chamfers give timber real edge highlights. Collider allowance is explicit.
        if (data.material in ['wood','metal'] and data.name!='AM05_iron_nails') or data.name.startswith(('AM04_basin_masonry','AM01_ore_catch')):
            bpy.context.view_layer.objects.active=ob;ob.select_set(True)
            mod=ob.modifiers.new('Authored edge wear','BEVEL');mod.width=.025 if data.material=='stone' else (.012 if data.material=='wood' else .006);mod.segments=2 if data.material=='stone' else 1
            bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
        grain.uv(ob.data)
    add_seams(root,scene)
    return root

def add_seams(root,scene):
    """Branching ribbons projected onto the actual continuous host facets.
    Their back lies inside stone, with a narrow, chipped exposed ridge.
    """
    host=bpy.data.objects['AM01_rock_mass'];tree=BVHTree.FromObject(host,bpy.context.evaluated_depsgraph_get())
    vertices=[];faces=[];vertex_colors=[];receipts=[];grain_count=0
    def edge_grain(ring,previous,seed):
        nonlocal grain_count
        side=(ring[3]-ring[0]).normalized();tangent=(ring[1]-previous[1]).normalized()
        normal=tangent.cross(side).normalized()
        if normal.dot(ring[1]-ring[6])<0:normal.negate()
        edge=ring[0] if (seed//4)%2 else ring[3];center=edge-normal*.008
        radii=[.025+.020*abs(math.sin(seed*3.1)),.015+.013*abs(math.sin(seed*1.7)),.022]
        ps=[center+axis*sign*r for axis,r in zip([tangent,side,normal],radii) for sign in [-1,1]]
        start=len(vertices);vertices.extend(tuple(p) for p in ps)
        for a in [0,1]:
            for b in [2,3]:
                for c in [4,5]:
                    face=[a,b,c]
                    if (ps[b]-ps[a]).cross(ps[c]-ps[a]).dot((ps[a]+ps[b]+ps[c])/3-center)<0:face.reverse()
                    faces.append([start+i for i in face])
        vertex_colors.extend(['#8F8062','#B1A07C','#8C816A','#9D9174','#817B69','#B5A27D'])
        grain_count+=1
    def emit_strip(run,seed,fracture=False):
        if len(run)<3:return None
        arc=sum((b[1]-a[1]).length for a,b in zip(run,run[1:]))
        if arc<.25:return None
        points=[p for ring in run for p in ring];shell=[]
        for i in range(len(run)-1):
            for j in range(8):shell.append([i*8+j,(i+1)*8+j,(i+1)*8+(j+1)%8,i*8+(j+1)%8])
        cap=[[j,j+1,7-j] for j in range(3)]+[[j+1,6-j,7-j] for j in range(3)]
        shell.extend(cap);end=(len(run)-1)*8
        shell.extend([[end+j for j in reversed(face)] for face in cap])
        volume=sum(points[f[0]].dot(points[f[k]].cross(points[f[k+1]]))/6 for f in shell for k in range(1,len(f)-1))
        assert abs(volume)>1e-9,'Collapsed continuous mineral strip'
        offset=len(vertices);vertices.extend(tuple(p) for p in points)
        for f in shell:faces.append([offset+j for j in (list(reversed(f)) if volume<0 else f)])
        mineral=['#A28D66','#78988A','#A0A89B'][seed%3]
        def tint(h,f):return '#'+''.join(f'{max(0,min(255,round(int(h[k:k+2],16)*f))):02x}' for k in (1,3,5))
        for i,r in enumerate(run):
            x,z,y=r[1];host=rock_color(y,0,x,-z)
            dark=tint(host,.68 if fracture else .82)
            core=dark if fracture else tint(mineral,.87+.25*(.5+.5*math.sin(i*2.73+seed*.91)))
            vertex_colors.extend([dark,core,core,dark,dark,dark,dark,dark])
        return {'segments':len(run)-1,'sharedRingVertices':len(points),'arcLengthM':arc,
                'widthRangeM':[min((r[3]-r[0]).length for r in run),max((r[3]-r[0]).length for r in run)],
                'closedSignedVolumeM3':abs(volume),'surface':'fracture' if fracture else 'mineral'}
    def ribbon(points,seed,width,fracture=False):
        rings=[];samples=[];last_side=None
        for i,p in enumerate(points):
            target=Vector(v3(p));hit,normal,_,distance=tree.find_nearest(target)
            if distance is None or distance>.95:
                rings.append(None);continue
            tangent=Vector(v3(points[min(i+1,len(points)-1)]))-Vector(v3(points[max(0,i-1)]))
            side=normal.cross(tangent).normalized()
            if last_side is not None and side.dot(last_side)<0:side.negate()
            last_side=side
            taper=.20+.80*min(1,i/7,(len(points)-1-i)/7)
            w=width*taper*(.44+.36*math.sin(i*.29+seed)**2+.20*abs(math.sin(i*2.13+seed)))
            front=[];back=[]
            jitter=.14*math.sin(i*2.37+seed)
            for k,sign in enumerate([-1+jitter,-.38+jitter*.3,.38+jitter*.3,1+jitter]):
                point,n,_,d=tree.find_nearest(hit+side*sign*w)
                # A shallow broken ridge, flanked by dark host-coloured lips.
                # The core is narrow; the full ribbon no longer reads as paint.
                exposed=.0015 if k in [0,3] else .003+.011*(.5+.5*math.sin(i*1.67+k+seed))
                samples.append(d);front.append(point+n*exposed);back.append(point-n*.045)
            ring=front+list(reversed(back))
            rings.append(ring)
        run=[];components=[]
        for ring in rings+[None]:
            invalid=ring is None or (ring[3]-ring[0]).length<.006
            if not invalid and run and (ring[1]-run[-1][1]).length<.012:continue
            if not invalid and run and (ring[1]-run[-1][1]).length>.50:
                receipt=emit_strip(run,seed,fracture)
                if receipt:components.append(receipt)
                run=[]
            if invalid:
                receipt=emit_strip(run,seed,fracture)
                if receipt:components.append(receipt)
                run=[]
            else:run.append(ring)
        if seed==0 and not fracture and width>.1:
            for i in range(5,len(rings)-1,4):
                if rings[i] is not None and rings[i-1] is not None and (rings[i][1]-rings[i-1][1]).length>.012:
                    edge_grain(rings[i],rings[i-1],i)
        receipts.append({'components':components,'projectedSamples':len(samples),'maxEdgeProjectionM':max(samples,default=0)})
    for index,v in enumerate(VEINS):
        x0,y0,z0=v['socket'];left=-12.6 if index<2 else -11.5;right=-4.0 if index<2 else 11.5
        def line(x):
            dx=x-x0;return [x,y0+.06*dx+.26*math.sin(dx*.75)+.09*math.sin(dx*1.7),z0-.15]
        points=[line(left+(right-left)*i/80) for i in range(81)]
        if index==0:
            side_path=[[-13.35,y0-.45+.07*i,-18.0-i*.25] for i in range(12)]
            a,b=side_path[-1],points[0]
            turn=[[a[k]+(b[k]-a[k])*i/10 for k in range(3)] for i in range(1,10)]
            points=side_path+turn+points
        ribbon(points,index,.115 if index==0 else .145)
        for sign in [-1,1]:
            start=x0+sign*2.2;begin=line(start)
            branch=[[begin[0]+sign*t*1.55,begin[1]+sign*t*.72+.13*math.sin(t*4),begin[2]] for t in [i/18 for i in range(19)]]
            ribbon(branch,index,.043)
        if index==0:
            # Sparse hairline splays reach into two actual host faults. Their
            # tips taper into rock; no loose scatter or extra runtime batch.
            for j,x in enumerate([-11.0,-9.72,-7.6,-4.98]):
                start=line(x);direction=-1 if j%2 else 1
                branch=[[start[0]+.23*t+.07*math.sin(t*5+j),start[1]+direction*t*.62,start[2]] for t in [k/15 for k in range(16)]]
                ribbon(branch,index,.018)
            for j,x in enumerate([-9.72,-4.98]):
                crack=[[x+(.055 if j==0 else -.07)*(yy-1.3),yy,z0-.15] for yy in [.45+k*.12 for k in range(19)]]
                ribbon(crack,index,.013,fracture=True)
    me=bpy.data.meshes.new('AM01_inlaid_seams');me.from_pydata(vertices,[],faces);me.update();me.materials.append(material('stone'))
    col=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
    for p in me.polygons:
        for i in p.loop_indices:col.data[i].color=linear(vertex_colors[me.loops[i].vertex_index])
    grain.uv(me);ob=bpy.data.objects.new('AM01_inlaid_seams',me);scene.collection.objects.link(ob);ob.parent=root;ob['materialRole']='stone';ob['semantic']='inlaid-mineral'
    (EVIDENCE/'seam-host-qa.json').write_text(json.dumps({'ribbons':receipts,'edgeFractureGrains':grain_count,'frontOffsetRangeM':[.0015,.014],'embeddedThicknessM':.045,'construction':'shared eight-vertex jagged rings with narrow mineral core and host-coloured lips; end caps only at actual terminations','collision':'visual inlay; existing host wall collider retained'},indent=1)+'\n')

def merge_runtime(source,scene):
    root=bpy.data.objects.new('alpha_mine',None);scene.collection.objects.link(root)
    root['assetId']='alpha-mine-quarry-v4-layered';root['units']='metres';root['entranceFace']='+Z';root['layout']='layout.json'
    for role in PALETTE:
        verts=[];faces=[];colors=[];uvs=[]
        for ob in source.children:
            if ob.get('materialRole')!=role:continue
            me=ob.data;offset=len(verts);verts.extend(tuple(v.co) for v in me.vertices)
            for poly in me.polygons:
                faces.append([offset+i for i in poly.vertices]);colors.append([tuple(me.color_attributes['Col'].data[i].color) for i in poly.loop_indices]);uvs.append([tuple(me.uv_layers.active.data[i].uv) for i in poly.loop_indices])
        me=bpy.data.meshes.new('AM_batch_'+role);me.from_pydata(verts,[],faces);me.update();me.materials.append(material(role))
        col=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
        for p,cs in zip(me.polygons,colors):
            for i,c in zip(p.loop_indices,cs):col.data[i].color=c
        uv=me.uv_layers.new(name='UVMap')
        for p,coords in zip(me.polygons,uvs):
            for i,c in zip(p.loop_indices,coords):uv.data[i].uv=c
        ob=bpy.data.objects.new('AM_batch_'+role,me);scene.collection.objects.link(ob);ob.parent=root;ob['materialRole']=role
    sockets={v['id']+'_mount':v['socket'] for v in VEINS}
    sockets.update({v['id']+'_oreRest':ore_rest(v) for v in VEINS})
    sockets.update({'basin_drop':POOL['dropSocket'],'basin_impact':POOL['impact'],'rack_detector':RACK['detectorSocket'],'rack_pickaxe':RACK['pickaxeSocket']})
    for name,p in sockets.items():
        ob=bpy.data.objects.new(name,None);scene.collection.objects.link(ob);ob.parent=root;ob.location=v3(p);ob['socketId']=name
    return root

def inspect(root):
    points=[];rows=[];materials={};problems=[]
    for ob in root.children_recursive:
        if ob.type!='MESH':continue
        me=ob.data;me.calc_loop_triangles();pts=[ob.matrix_world@v.co for v in me.vertices];points.extend(pts)
        areas=[(pts[t.vertices[1]]-pts[t.vertices[0]]).cross(pts[t.vertices[2]]-pts[t.vertices[0]]).length/2 for t in me.loop_triangles]
        copy=me.copy();repair=copy.validate(verbose=False);bpy.data.meshes.remove(copy)
        bm=bmesh.new();bm.from_mesh(me)
        # Raw GLB hard-normal/color seams split vertices; disposable weld is diagnostic only.
        raw_open=sum(not e.is_manifold for e in bm.edges);raw_bad=sum(e.is_manifold and not e.is_contiguous for e in bm.edges)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        welded_open=sum(not e.is_manifold for e in bm.edges);bad_winding=sum(e.is_manifold and not e.is_contiguous for e in bm.edges);bm.free()
        row={'name':ob.name,'triangles':len(areas),'degenerate':sum(a<1e-12 for a in areas),'validateWouldRepair':repair,
             'rawNonmanifoldEdges':raw_open,'weldedNonmanifoldEdges':welded_open,'rawBadWinding':raw_bad,'weldedBadWinding':bad_winding,'scale':list(ob.scale)}
        rows.append(row)
        if row['degenerate'] or repair or raw_bad or not all(math.isfinite(x) for p in pts for x in p):problems.append(row)
        for mat in me.materials:
            bs=mat.node_tree.nodes.get('Principled BSDF')
            materials[mat.name]={'roughness':bs.inputs['Roughness'].default_value,'metallic':bs.inputs['Metallic'].default_value,
                                 'vertexColors':len(me.color_attributes)>0,'colorLayers':[a.name for a in me.color_attributes],
                                 'usersOnAsset':sum(1 for p in me.polygons if me.materials[p.material_index]==mat)}
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    return {'triangles':sum(r['triangles'] for r in rows),'meshCount':len(rows),'blenderBounds':[lo,hi],
            'dimensionsBlender':[hi[i]-lo[i] for i in range(3)],'materials':materials,'meshes':rows,'problems':problems}

def export_glb(root):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root]+list(root.children_recursive):ob.select_set(True)
    props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    opts=dict(export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,
        export_materials='EXPORT',export_vertex_color='ACTIVE',export_texcoords=True,export_tangents=False,
        export_cameras=False,export_lights=False,export_animations=False,export_extras=True,export_image_format='AUTO',
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_color_quantization=10)
    missing=set(opts)-props
    if missing:raise RuntimeError('Unsupported exporter options '+str(missing))
    bpy.ops.export_scene.gltf(filepath=str(GLB),**opts)
    return opts

def render_views(root,views=None,folder=None,resolution=(1000,760)):
    scene=bpy.context.scene
    engines={v.identifier for v in scene.render.bl_rna.properties['engine'].enum_items}
    scene.render.engine=next((e for e in ['BLENDER_EEVEE','BLENDER_EEVEE_NEXT'] if e in engines),'CYCLES')
    eevee=getattr(scene,'eevee',None)
    if eevee and hasattr(eevee,'taa_render_samples'):eevee.taa_render_samples=16
    if eevee and hasattr(eevee,'use_raytracing'):eevee.use_raytracing=False
    if scene.render.engine=='CYCLES':scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.render.resolution_x=resolution[0];scene.render.resolution_y=resolution[1];scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=0;scene.view_settings.gamma=1
    looks={v.identifier for v in scene.view_settings.bl_rna.properties['look'].enum_items}
    look=next((s for s in looks if s.endswith('Medium High Contrast')),None)
    if look:scene.view_settings.look=look
    world=bpy.data.worlds.new('AM_studio_world');world.use_nodes=True;scene.world=world
    bg=world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.37,.46,.56,1);bg.inputs['Strength'].default_value=.65
    floor=bpy.data.materials.new('AM_studio_floor');floor.diffuse_color=linear('#7B8551');floor.use_nodes=True
    floor.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=linear('#7B8551')
    floor.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.96
    bpy.ops.mesh.primitive_plane_add(size=170,location=(0,0,-.14));bpy.context.object.name='STUDIO_floor';bpy.context.object.data.materials.append(floor)
    for name,typ,position,energy,color in [('STUDIO_sun','SUN',(25,-35,45),3.4,(1,.80,.58)),('STUDIO_fill','AREA',(-20,-5,24),1150,(.64,.77,1))]:
        data=bpy.data.lights.new(name,typ);data.energy=energy;data.color=color
        if typ=='SUN':data.angle=math.radians(7)
        else:data.shape='DISK';data.size=22
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=position;ob.rotation_euler=(Vector((0,16,2))-ob.location).to_track_quat('-Z','Y').to_euler()
    # Integration supplies the real water. This preview-only surface demonstrates the empty pool.
    cx,_,cz=POOL['center'];bpy.ops.mesh.primitive_circle_add(vertices=64,radius=2.80,fill_type='NGON',location=(cx,-cz,.28))
    water=bpy.context.object;water.name='STUDIO_water';wm=bpy.data.materials.new('STUDIO_water');wm.use_nodes=True
    bs=wm.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=linear('#39746D');bs.inputs['Roughness'].default_value=.18
    bs.inputs['Metallic'].default_value=.05;bs.inputs['IOR'].default_value=1.333
    if 'Transmission Weight' in bs.inputs:bs.inputs['Transmission Weight'].default_value=.2
    water.data.materials.append(wm)
    camd=bpy.data.cameras.new('STUDIO_camera');cam=bpy.data.objects.new('STUDIO_camera',camd);scene.collection.objects.link(cam);scene.camera=cam
    camd.lens=36;camd.clip_end=250
    for i,p in enumerate(LAMPS):
        ld=bpy.data.lights.new('STUDIO_lantern_'+str(i),'POINT');ld.energy=24;ld.color=(1,.58,.23);ld.shadow_soft_size=.24
        lo=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(lo);lo.location=v3(p)
    views=views or [('entrance-close',(2.5,2.6,-8.5),(-6.2,3.8,-25))]
    folder=folder or EVIDENCE
    outputs=[]
    for name,p,t in views:
        cam.location=v3(p);target=Vector(v3(t));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        path=folder/(name+'.png');scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True);outputs.append(path.name)
    return {'images':outputs,'renderer':scene.render.engine,'resolution':list(resolution),
            'viewTransform':scene.view_settings.view_transform,'look':scene.view_settings.look,'exposure':0,'gamma':1,'views':views,
            'scope':'fresh exact delivered GLB; studio lights/floor/cameras and basin water are preview only; not game integration or character validation'}

def run(preview=True):
    EVIDENCE.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    write_proxies();bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    author_scene=bpy.context.scene;author_scene.name='AM_Editable'
    author=create_source(author_scene);author_scene.view_layers[0].update();author_stats=inspect(author)
    runtime_scene=bpy.data.scenes.new('AM_Runtime');root=merge_runtime(author,runtime_scene)
    bpy.context.window.scene=runtime_scene;bpy.context.view_layer.update();runtime_stats=inspect(root)
    if author_stats['problems'] or runtime_stats['problems'] or author_stats['triangles']!=runtime_stats['triangles']:
        (EVIDENCE/'build-failure.json').write_text(json.dumps({'author':author_stats,'runtime':runtime_stats},indent=1))
        raise RuntimeError('Native or batch parity failure')
    export_opts=export_glb(root)
    raw=GLB.read_bytes();json_length=struct.unpack_from('<I',raw,12)[0];serialized=json.loads(raw[20:20+json_length])
    normal_materials={m['name']:m.get('normalTexture') for m in serialized['materials'] if m['name'] in ['AM_stone','AM_ground']}
    if len(normal_materials)!=2 or not all(normal_materials.values()):raise RuntimeError('Portable grain normal texture missing in GLB')
    bpy.context.window.scene=author_scene;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.window.scene=bpy.data.scenes['AM_Runtime'];bpy.context.view_layer.update()
    reopened=inspect(bpy.data.objects['alpha_mine'])
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB));root=bpy.data.objects['alpha_mine'];bpy.context.view_layer.update()
    imported=inspect(root);delta=max(abs(a-b) for aa,bb in zip(runtime_stats['blenderBounds'],imported['blenderBounds']) for a,b in zip(aa,bb))
    if imported['problems'] or reopened['problems'] or imported['triangles']!=runtime_stats['triangles'] or delta>1e-4:raise RuntimeError('Fresh GLB/source exchange failure')
    badmat=[]
    for name,m in runtime_stats['materials'].items():
        fresh=imported['materials'].get(name)
        if not fresh or any(abs(m[k]-fresh[k])>1e-5 for k in ['roughness','metallic']) or not fresh['vertexColors']:badmat.append(name)
    if badmat:raise RuntimeError('Material persistence failure '+str(badmat))
    (EVIDENCE/'build-failure.json').unlink(missing_ok=True)
    report={'asset':'alpha-mine-batch1','blenderVersion':bpy.app.version_string,'source':str(SOURCE.relative_to(HERE.parent.parent.parent)),
            'glb':'public/world/alpha-mine/quarry-static.glb','glbSha256':hashlib.sha256(GLB.read_bytes()).hexdigest(),
            'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':GLB.stat().st_size,'exportOptions':export_opts,
            'generatorSha256':{name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['layout.py','geometry.py','build.py','veins.py','refine.py','prepare_preview.mjs']},
            'portableGrainNormals':normal_materials,
            'editable':author_stats,'runtime':runtime_stats,'reopened':reopened,'freshGLB':imported,'maxBoundsDeltaM':delta,
            'collisionScope':'rock/ground/basin source triangles; explicitly authored timber boxes with <=12mm bevel allowance; continuous plank support sheets',
            'limits':'global seam weld diagnostics may merge intentionally joined timber; see pre-Blender per-component topology and layout support samples; no game/capsule/animation claim'}
    (EVIDENCE/'batch1-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    layout=json.loads((OUT/'layout.json').read_text());layout['batch1Status']='native, reopened source and fresh GLB exchange passed; visual review pending'
    layout['staticGeometry']={'triangles':imported['triangles'],'meshBatches':imported['meshCount'],'bytes':report['bytes'],'sha256':report['glbSha256']}
    (OUT/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    print('AM_EXPORT_PASS',imported['triangles'],imported['meshCount'],report['bytes'],delta,flush=True)
    if preview:
        render=render_views(root);render['glbSha256']=report['glbSha256'];(EVIDENCE/'render-manifest.json').write_text(json.dumps(render,indent=1)+'\n')
        print('AM_RENDER_PASS',render['images'],flush=True)

def render_saved():
    before=hashlib.sha256(GLB.read_bytes()).hexdigest()
    frozen=json.loads((EVIDENCE/'batch1-qa.json').read_text())
    assert before==frozen['glbSha256'], 'Render the exact already-validated GLB'
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB))
    result=render_views(bpy.data.objects['alpha_mine']);result['glbSha256']=before
    assert before==hashlib.sha256(GLB.read_bytes()).hexdigest()
    (EVIDENCE/'render-manifest.json').write_text(json.dumps(result,indent=1)+'\n');print('AM_RENDER_PASS',result['images'],flush=True)

if __name__=='__main__':
    if 'render-only' in sys.argv:render_saved()
    else:run()
