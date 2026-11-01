"""Three closed, embedded mineral patches, each with three explicit damage states.
Build with the existing Blender, under the shared heavy-job lock.
All authored positions are facility-local glTF metres, converted exactly once.
"""
import sys, math, json, hashlib, struct
from pathlib import Path
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from layout import OUT, VEINS, ore_rest, contract, smooth, seam_curve
from build import v3, linear
import grain

GLB=OUT/'veins.glb';SOURCE=HERE/'veins.blend';EVIDENCE=HERE/'evidence'
TINTS=['#b7864d','#5c9b91','#9ba8b1']
HOST={};HOST_CACHE={};HOST_BINDINGS=[];HOST_LIMITS={}

def load_host():
    """Use the exact editable host and its portable stone material, not a guess."""
    with bpy.data.libraries.load(str(HERE/'batch1.blend'),link=False) as (source,dest):
        dest.objects=['AM01_rock_mass']
    ob=dest.objects[0];bpy.context.scene.collection.objects.link(ob);ob.parent=None
    me=ob.data;me.calc_loop_triangles();vertices=[v.co.copy() for v in me.vertices]
    triangles=[list(t.vertices) for t in me.loop_triangles]
    colors=[[tuple(me.color_attributes['Col'].data[i].color) for i in t.loops] for t in me.loop_triangles]
    HOST.update(vertices=vertices,triangles=triangles,colors=colors,tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True))
    stone=me.materials[0].copy();stone.name='AM_vein_host'
    bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(me);HOST_CACHE.clear();HOST_BINDINGS.clear();HOST_LIMITS.clear()
    return stone

def host_upper_limit(v):
    if v['id'] in HOST_LIMITS:return HOST_LIMITS[v['id']]
    sx,sy,sz=v['socket'];limit=.63
    for i in range(17):
        x=-.72+1.44*i/16
        def hit(y):return HOST['tree'].ray_cast(Vector(v3((sx+x,sy+y,sz+1))),Vector((0,1,0)),3)[0] is not None
        assert hit(0),(v['id'],'host missing at contact height')
        if hit(.63):continue
        low,high=0,.63
        for _ in range(18):
            mid=(low+high)/2
            if hit(mid):low=mid
            else:high=mid
        limit=min(limit,low-.03)
    assert limit>.04,(v['id'],'insufficient host above contact')
    HOST_LIMITS[v['id']]=limit;return limit

def sample_host(v,x,y):
    key=(v['id'],round(x,8),round(y,8))
    if key in HOST_CACHE:return HOST_CACHE[key]
    sx,sy,sz=v['socket'];start=Vector(v3((sx+x,sy+y,sz+1)))
    point,normal,index,distance=HOST['tree'].ray_cast(start,Vector((0,1,0)),3)
    assert point is not None,(v['id'],'host ray miss',x,y)
    a,b,c=[HOST['vertices'][i] for i in HOST['triangles'][index]]
    e0,e1,e2=b-a,c-a,point-a;d00=e0.dot(e0);d01=e0.dot(e1);d11=e1.dot(e1);d20=e2.dot(e0);d21=e2.dot(e1)
    den=d00*d11-d01*d01;v0=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den
    weights=[1-v0-w,v0,w];rgb=tuple(sum(weights[i]*HOST['colors'][index][i][k] for i in range(3)) for k in range(4))
    result=(-point.y-sz,rgb);HOST_CACHE[key]=result;return result

def portable_uv(mesh,origin):
    """Same metre-scale UV axes as the static stone, including facility origin."""
    grain.uv(mesh);layer=mesh.uv_layers.active;offset=Vector(v3(origin))
    for p in mesh.polygons:
        axis=max(range(3),key=lambda k:abs(p.normal[k]))
        for i in p.loop_indices:
            v=mesh.vertices[mesh.loops[i].vertex_index].co+offset
            pair=(v.x,-v.y) if axis==2 else ((v.x,v.z) if axis==1 else (-v.y,v.z))
            layer.data[i].uv=(pair[0]/.95,pair[1]/.95)

def patch(state,vein):
    """One watertight shell: fractures change real depth, without decal overlays."""
    nx,ny=12,14;vertices=[];faces=[];roles=[]
    def front(x,y):
        fissure=y-seam_curve(x)
        # The edge disappears into its host rock. Only the small productive
        # pocket projects forward; no rectangular plaque stands off the wall.
        r=math.hypot(x/.28,y/.24);coverage=1-smooth(.65,1.25,r)
        host,_=sample_host(vein,x,y)
        z=host*(1-coverage)+.255*coverage-.015*(1-coverage)
        if state=='cracked':z-=.095*math.exp(-(fissure/.075)**2)*coverage
        if state=='open':
            z-=.205*coverage
        return z
    for j in range(ny+1):
        y=-.55+j/ny*1.10
        for i in range(nx+1):
            u=-1+2*i/nx
            width=.61+.035*math.sin(y*6+.4)+.025*math.sin(y*13)
            x=u*width
            yy=y+.025*math.sin(i*1.8+j*.7)*(1 if j in [0,ny] else .4)
            if j in [0,ny]:yy+=(1 if j==ny else -1)*.035*(1-u*u)
            if yy>0:yy*=host_upper_limit(vein)/.63
            vertices.append((x,yy,front(x,yy)))
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+2;d=a+nx+1
            for tri in ([(a,b,d),(b,c,d)] if (i+j)%2 else [(a,b,c),(a,c,d)]):
                p=[vertices[k] for k in tri];x=sum(t[0] for t in p)/3;y=sum(t[1] for t in p)/3
                band=abs(y-seam_curve(x));branch=abs(y-seam_curve(x)-.45*(x+.35))
                mineral=band<(.065+.045*math.cos(x*2.1)**2) or (-.65<x<-.10 and branch<.055)
                if state=='open' and math.hypot(x/.65,y/.48)<.65:mineral=False
                faces.append(tri);roles.append(1 if mineral else 0)
    boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]
    boundary += [ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
    back=[]
    back_z=min(p[2] for p in vertices)-.08
    for k in boundary:
        x,y,z=vertices[k];back.append(len(vertices));vertices.append((x*.94,y*.94,back_z))
    center=len(vertices);vertices.append((0,0,back_z))
    for k in range(len(boundary)):
        n=(k+1)%len(boundary)
        faces.extend([(boundary[k],back[k],back[n],boundary[n]),(center,back[n],back[k])]);roles.extend([0,0])
    return vertices,faces,roles

def mat(name,color,roughness,metallic=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=linear(color)
    bs.inputs['Roughness'].default_value=roughness;bs.inputs['Metallic'].default_value=metallic
    return m

def empty(name,parent=None,position=(0,0,0)):
    ob=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(ob);ob.parent=parent;ob.location=v3(position);return ob

def colour_factor_socket(material):
    """Read the actual constant in the installed glTF importer's node topology.
    With Col present the importer links a MULTIPLY Color Factor node to BSDF;
    the disconnected BSDF default (0.8) is not the rendered base-colour factor.
    """
    slot=material.node_tree.nodes['Principled BSDF'].inputs['Base Color']
    if not slot.is_linked:return slot,'direct constant'
    node=slot.links[0].from_node
    if node.bl_idname=='ShaderNodeVertexColor':return None,'vertex colour, unit factor'
    assert node.bl_idname=='ShaderNodeMix' and node.blend_type=='MULTIPLY' and node.label=='Color Factor',node.bl_idname
    assert node.inputs[6].is_linked and node.inputs[6].links[0].from_node.bl_idname=='ShaderNodeVertexColor'
    assert not node.inputs[7].is_linked
    return node.inputs[7],'vertex colour multiplied by constant'

def colour_factor(slot):
    """Evaluate only constant factors in the portable VC/texture multiply graph."""
    if not slot.is_linked:return tuple(slot.default_value)
    node=slot.links[0].from_node
    if node.bl_idname in ['ShaderNodeVertexColor','ShaderNodeTexImage']:return (1,1,1,1)
    assert node.blend_type=='MULTIPLY',node.bl_idname
    if node.bl_idname=='ShaderNodeMixRGB':
        assert node.inputs[0].default_value==1;a,b=node.inputs[1],node.inputs[2]
    else:
        assert node.bl_idname=='ShaderNodeMix' and node.inputs['Factor'].default_value==1
        a,b=node.inputs[6],node.inputs[7]
    left,right=colour_factor(a),colour_factor(b)
    return tuple(x*y for x,y in zip(left,right))

def portable_stone_contract():
    def read(path):
        raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
        return raw,json.loads(raw[20:20+n]),28+n
    def record(path,name):
        raw,j,base=read(path);m=next(m for m in j['materials'] if m['name']==name)
        result={}
        for key,info in [('baseColor',m['pbrMetallicRoughness']['baseColorTexture']),('normal',m['normalTexture'])]:
            texture=j['textures'][info['index']];im=j['images'][texture['source']];view=j['bufferViews'][im['bufferView']]
            start=base+view.get('byteOffset',0);data=raw[start:start+view['byteLength']]
            result[key]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'scale':info.get('scale',1)}
        return result
    static=record(OUT/'quarry-static.glb','AM_stone');dynamic=record(GLB,'AM_vein_host')
    assert static==dynamic,('portable host texture/normal mismatch',static,dynamic)
    return {'static':static,'dynamic':dynamic,'uv':'same dominant-face metre projection / 0.95, in facility coordinates',
            'vertexColor':'barycentrically sampled from exact editable static host; no global colour multiplier'}

def create():
    stone=load_host();roots=[]
    for index,v in enumerate(VEINS):
        root=empty(v['id']);root['placement']=v['socket'];root['defaultState']='intact';root['units']='metres';roots.append(root)
        mineral=mat('AM_mineral_'+v['id'],TINTS[index],.48,.10)
        for state in ['intact','cracked','open']:
            group=empty(v['id']+'_'+state,root);group['damageState']=state
            vs,fs,roles=patch(state,v);me=bpy.data.meshes.new(v['id']+'_'+state+'_shell')
            me.from_pydata([v3(p) for p in vs],[],fs);me.update();me.materials.append(stone);me.materials.append(mineral)
            colours=me.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
            for p,role in zip(me.polygons,roles):
                p.material_index=role
                for loop in p.loop_indices:
                    x,y,z=vs[me.loops[loop].vertex_index];_,c=sample_host(v,x,y)
                    colours.data[loop].color=c if role==0 else (1,1,1,1)
            portable_uv(me,v['socket'])
            exposed=[];embedded=0
            for x,y,z in vs[:13*15]:
                host,_=sample_host(v,x,y);delta=z-host
                if delta>.02:exposed.append((x,y))
                if math.hypot(x/.28,y/.24)>=1.25:
                    assert delta<-.0149,(v['id'],state,'outer face not embedded',delta)
                    embedded+=1
            HOST_BINDINGS.append({'vein':v['id'],'state':state,'embeddedOuterVertices':embedded,
                'exposedWidthM':max(p[0] for p in exposed)-min(p[0] for p in exposed),
                'exposedHeightM':max(p[1] for p in exposed)-min(p[1] for p in exposed)})
            ob=bpy.data.objects.new(v['id']+'_'+state+'_rock',me);bpy.context.scene.collection.objects.link(ob);ob.parent=group
            empty(v['id']+'_'+state+'_impact',group,(0,0,{'intact':.255,'cracked':.160,'open':.050}[state]))
        # The hit marker lies on the unbroken exposed front at the centre.
        empty(v['id']+'_impact',root,(0,0,.255))
        rest=ore_rest(v);empty(v['id']+'_oreRest',root,[rest[i]-v['socket'][i] for i in range(3)])
    bpy.context.view_layer.update();return roots

def inspect():
    report=[]
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH':continue
        me=ob.data;me.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(me)
        row={'node':ob.name,'triangles':len(me.loop_triangles),'hasCornerColors':bool(me.color_attributes),'nonmanifold':sum(not e.is_manifold for e in bm.edges),
             'badWinding':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'volume':bm.calc_volume(signed=True),
             'degenerate':sum(t.area<1e-12 for t in me.loop_triangles),'scale':list(ob.scale)}
        bm.free();copy=me.copy();row['validateWouldRepair']=copy.validate();bpy.data.meshes.remove(copy)
        assert not any(row[k] for k in ['nonmanifold','badWinding','degenerate','validateWouldRepair']),row
        assert row['volume']>0,row
        report.append(row)
    sockets={};contacts={}
    for v in VEINS:
        root=bpy.data.objects[v['id']];assert all(abs(s-1)<1e-6 for s in root.scale)
        assert root.location.length<1e-8
        for state in ['intact','cracked','open']:assert bpy.data.objects[v['id']+'_'+state].parent==root
        for kind in ['impact','oreRest','intact_impact','cracked_impact','open_impact']:
            ob=bpy.data.objects[v['id']+'_'+kind];p=ob.matrix_world.translation
            sockets[ob.name]=[p.x,p.z,-p.y]
        for state in ['intact','cracked','open']:
            ob=bpy.data.objects[v['id']+'_'+state+'_rock'];target=bpy.data.objects[v['id']+'_'+state+'_impact'].matrix_world.translation
            tree=BVHTree.FromPolygons([ob.matrix_world@p.co for p in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons])
            point,normal,index,distance=tree.find_nearest(target)
            assert distance<.008,(v['id'],state,distance)
            contacts[v['id']+'_'+state]={'nearestSurfaceDistanceM':distance,'surfacePoint':[point.x,point.z,-point.y]}
    materials={}
    used={m for ob in bpy.context.scene.objects if ob.type=='MESH' for m in ob.data.materials}
    for m in used:
        if not m.use_nodes:continue
        bs=m.node_tree.nodes.get('Principled BSDF')
        if bs:
            materials[m.name]={'baseColor':list(colour_factor(bs.inputs['Base Color'])),
                'baseColorRoute':'resolved constant factor through VC/texture multiply graph','roughness':bs.inputs['Roughness'].default_value,'metallic':bs.inputs['Metallic'].default_value}
    return {'meshes':report,'triangles':sum(r['triangles'] for r in report),'sockets':sockets,'surfaceContacts':contacts,'materials':materials}

def render():
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
    world=bpy.data.worlds.new('VEIN_preview');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55;scene.world=world
    # Presentation rows are temporary clones of the fresh GLB, never exported.
    for index,v in enumerate(VEINS):
        root=bpy.data.objects[v['id']];root.location=v3((0,(1-index)*2.0,0))
        for column,state in enumerate(['intact','cracked','open']):bpy.data.objects[v['id']+'_'+state].location=v3(((column-1)*2.0,0,0))
    ld=bpy.data.lights.new('PREVIEW_key','AREA');ld.energy=700;ld.shape='DISK';ld.size=5
    light=bpy.data.objects.new('PREVIEW_key',ld);scene.collection.objects.link(light);light.location=v3((-3,6,6));light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    cd=bpy.data.cameras.new('PREVIEW_camera');camera=bpy.data.objects.new('PREVIEW_camera',cd);scene.collection.objects.link(camera);scene.camera=camera
    camera.location=v3((2.2,1,10));camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=10.2
    scene.render.filepath=str(EVIDENCE/'veins-states.png');bpy.ops.render.render(write_still=True)

def run(preview=True):
    OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(exist_ok=True);bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    roots=create();native=inspect();bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_draco_mesh_compression_enable=True,export_draco_position_quantization=20,export_draco_normal_quantization=12)
    raw=GLB.read_bytes();length=struct.unpack_from('<I',raw,12)[0];serialized=json.loads(raw[20:20+length]);pbr={m['name']:m.get('pbrMetallicRoughness',{}) for m in serialized['materials']}
    for name,m in native['materials'].items():
        record=pbr[name]
        assert math.dist(record.get('baseColorFactor',[1,1,1,1]),m['baseColor'])<1e-5,(name,'serialized colour')
        assert abs(record.get('roughnessFactor',1)-m['roughness'])<1e-5 and abs(record.get('metallicFactor',1)-m['metallic'])<1e-5,(name,'serialized PBR')
    assert all('COLOR_0' in p['attributes'] for mesh in serialized['meshes'] for p in mesh['primitives'])
    stone_contract=portable_stone_contract()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));reopened=inspect()
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB))
    # GLB hard-normal seams are split on import. Weld a disposable diagnostic copy.
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':
            bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5);bm.to_mesh(ob.data);bm.free();ob.data.update()
    bpy.context.view_layer.update();fresh=inspect()
    assert native['triangles']==reopened['triangles']==fresh['triangles']
    for name,p in native['sockets'].items():assert math.dist(p,fresh['sockets'][name])<1e-5,(name,p,fresh['sockets'][name])
    for name,m in native['materials'].items():
        f=fresh['materials'][name]
        assert all(abs(m[k]-f[k])<1e-5 for k in ['roughness','metallic']) and math.dist(m['baseColor'],f['baseColor'])<1e-5,(name,m,f)
    report={'asset':'alpha-veins','bytes':GLB.stat().st_size,'sha256':hashlib.sha256(GLB.read_bytes()).hexdigest(),
            'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'native':native,'reopened':reopened,'freshGLB':fresh,'serializedPBR':pbr,'portableStoneContract':stone_contract,
            'hostBindings':HOST_BINDINGS,'staticHostSourceSha256':hashlib.sha256((HERE/'batch1.blend').read_bytes()).hexdigest(),
            'units':'metres','rootPlacement':'each vein root is local zero; place at layout.veins[].socket',
            'stateVisibility':'all states exported; runtime must show only intact initially, then cracked or open',
            'oreRestMeaning':'ore centre, not bottom; supported by static stone ledge',
            'scope':'geometry and socket exchange only; game light, pick contact, pickup and creative acceptance pending'}
    (EVIDENCE/'veins-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    layout=json.loads((OUT/'layout.json').read_text());layout['dynamicAssets']['veins']=contract()['dynamicAssets']['veins']
    layout['dynamicAssets']['veins']['geometry']={'sha256':report['sha256'],'bytes':report['bytes'],'triangles':fresh['triangles']}
    (OUT/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    print('AM_VEINS_PASS',report['bytes'],fresh['triangles'],flush=True)
    if preview:
        render()
        (EVIDENCE/'veins-render.json').write_text(json.dumps({'glbSha256':report['sha256'],'image':'veins-states.png','columns':['intact','cracked','open'],'rows':[v['id'] for v in VEINS],'previewOnly':'temporary row/column transforms and studio light'},indent=1)+'\n')

if __name__=='__main__':run()
