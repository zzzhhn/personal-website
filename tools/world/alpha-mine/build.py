"""One bounded native build / fresh GLB QA / local preview job for batch 1.
Run from this checkout with existing Blender, factory startup and --threads 2.
"""
import bpy, bmesh, math, json, hashlib, sys, struct
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from layout import OUT, VEINS, POOL, RACK, LAMPS, ore_rest
from geometry import build_geometry, write_proxies
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
            for idx in poly.loop_indices:col.data[idx].color=linear(color)
        ob=bpy.data.objects.new(data.name,me);scene.collection.objects.link(ob);ob.parent=root;ob['materialRole']=data.material;ob['semantic']=data.semantic
        # Applied small chamfers give timber real edge highlights. Collider allowance is explicit.
        if (data.material in ['wood','metal'] and data.name!='AM05_iron_nails') or data.name.startswith(('AM04_basin_masonry','AM01_ore_catch')):
            bpy.context.view_layer.objects.active=ob;ob.select_set(True)
            mod=ob.modifiers.new('Authored edge wear','BEVEL');mod.width=.025 if data.material=='stone' else (.012 if data.material=='wood' else .006);mod.segments=2 if data.material=='stone' else 1
            bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
        grain.uv(ob.data)
    return root

def merge_runtime(source,scene):
    root=bpy.data.objects.new('alpha_mine',None);scene.collection.objects.link(root)
    root['assetId']='alpha-mine-quarry-v2';root['units']='metres';root['entranceFace']='+Z';root['layout']='layout.json'
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

def render_views(root):
    scene=bpy.context.scene
    engines={v.identifier for v in scene.render.bl_rna.properties['engine'].enum_items}
    scene.render.engine=next((e for e in ['BLENDER_EEVEE','BLENDER_EEVEE_NEXT'] if e in engines),'CYCLES')
    eevee=getattr(scene,'eevee',None)
    if eevee and hasattr(eevee,'taa_render_samples'):eevee.taa_render_samples=32
    if eevee and hasattr(eevee,'use_raytracing'):eevee.use_raytracing=True
    if scene.render.engine=='CYCLES':scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.render.resolution_x=1000;scene.render.resolution_y=760;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=0;scene.view_settings.gamma=1
    looks={v.identifier for v in scene.view_settings.bl_rna.properties['look'].enum_items}
    look=next((s for s in looks if s.endswith('Medium High Contrast')),None)
    if look:scene.view_settings.look=look
    world=bpy.data.worlds.new('AM_studio_world');world.use_nodes=True;scene.world=world
    bg=world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.37,.46,.56,1);bg.inputs['Strength'].default_value=.65
    floor=bpy.data.materials.new('AM_studio_floor');floor.diffuse_color=linear('#9F967E');floor.use_nodes=True
    floor.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=linear('#9F967E')
    floor.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.96
    bpy.ops.mesh.primitive_plane_add(size=170,location=(0,0,-.025));bpy.context.object.name='STUDIO_floor';bpy.context.object.data.materials.append(floor)
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
    views=[('entrance-close',(2.5,2.6,-8.5),(-6.2,3.8,-25))]
    outputs=[]
    for name,p,t in views:
        cam.location=v3(p);target=Vector(v3(t));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        path=EVIDENCE/(name+'.png');scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True);outputs.append(path.name)
    return {'images':outputs,'renderer':scene.render.engine,'resolution':[1000,760],
            'viewTransform':scene.view_settings.view_transform,'look':scene.view_settings.look,'exposure':0,'gamma':1,'views':views,
            'scope':'fresh exact delivered GLB; studio lights/floor/cameras and basin water are preview only; not game integration or character validation'}

def run():
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
            'portableGrainNormals':normal_materials,
            'editable':author_stats,'runtime':runtime_stats,'reopened':reopened,'freshGLB':imported,'maxBoundsDeltaM':delta,
            'collisionScope':'rock/ground/basin source triangles; explicitly authored timber boxes with <=12mm bevel allowance; continuous plank support sheets',
            'limits':'global seam weld diagnostics may merge intentionally joined timber; see pre-Blender per-component topology and layout support samples; no game/capsule/animation claim'}
    (EVIDENCE/'batch1-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    layout=json.loads((OUT/'layout.json').read_text());layout['batch1Status']='native, reopened source and fresh GLB exchange passed; visual review pending'
    layout['staticGeometry']={'triangles':imported['triangles'],'meshBatches':imported['meshCount'],'bytes':report['bytes'],'sha256':report['glbSha256']}
    (OUT/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    print('AM_EXPORT_PASS',imported['triangles'],imported['meshCount'],report['bytes'],delta,flush=True)
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
