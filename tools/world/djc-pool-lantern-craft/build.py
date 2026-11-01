"""DJC pool lantern craft. Meters, Z-up native, Y-up glTF exactly once."""
import bpy, bmesh, math, json, sys, hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np

TOOLS=Path(__file__).resolve().parent
REPO=TOOLS.parents[2]
OUT=REPO/'docs/world/phase-2-playground/djc-pool-lantern-craft-20261101'
TEXTURES=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/djc-quality-pilot-20261101/textures')
sys.path.insert(0,'/Users/a22309/.codex/skills/blender-material-craft/scripts')
from craft_geometry import box as craft_box

def rgb(h):
    def lin(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    return tuple(lin(int(h[i:i+2],16)/255) for i in (0,2,4))

def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c

def put(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);return o

def mesh(name,vertices,faces,m,c):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);c.objects.link(o)
    if m:me.materials.append(m)
    return o

def material(name,color,rough,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb(color),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb(color),1);return m

def image(name,arr,data=False):
    h,w=arr.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if data:im.colorspace_settings.name='Non-Color'
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=arr;im.pixels.foreach_set(rgba.ravel());im.pack();return im

def tex(m,im,socket):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs[socket]);return n

def normal(m,im,strength):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    q=m.node_tree.nodes.new('ShaderNodeNormalMap');q.inputs['Strength'].default_value=strength
    m.node_tree.links.new(n.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])

def palette():
    wood=material('DJC_Lantern_Timber','795535',.76)
    im=bpy.data.images.load(str(TEXTURES/'wood_diff.jpg'));im.colorspace_settings.name='sRGB';im.scale(1024,1024);im.pack()
    n=wood.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    mix=wood.node_tree.nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    mix.inputs[7].default_value=(*rgb('9f8268'),1)
    wood.node_tree.links.new(n.outputs['Color'],mix.inputs[6]);wood.node_tree.links.new(mix.outputs[2],wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    nm=bpy.data.images.load(str(TEXTURES/'wood_nor_gl.jpg'));nm.colorspace_settings.name='Non-Color';nm.scale(1024,1024);nm.pack();normal(wood,nm,.22)
    N=512;y,x=np.mgrid[:N,:N]/N
    stripes=.025*np.sin(x*math.tau*20)+.012*np.sin(x*math.tau*63+y*3)
    tex(wood,image('Authored low contrast timber roughness 512',np.repeat(np.clip(.73+stripes,0,1)[:,:,None],3,2),True),'Roughness')
    cloth=material('DJC_Lantern_Diffuser','ded2b5',.92)
    warp=np.sin(x*math.tau*96);weft=np.sin(y*math.tau*96)
    thread=.96+.04*(warp*.5+.5)*(weft*.5+.5)
    tex(cloth,image('Authored linen cream fiber color 512',thread[:,:,None]*np.array(rgb('ded2b5'))),'Base Color')
    nn=np.dstack((.12*np.cos(x*math.tau*96)*(.85+.15*weft),.12*np.cos(y*math.tau*96)*(.85-.15*warp),np.ones_like(warp)))
    nn/=np.linalg.norm(nn,axis=2)[:,:,None];normal(cloth,image('Authored linen tangent normal 512',nn*.5+.5,True),.48)
    p=cloth.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(*rgb('ffc478'),1);p.inputs['Emission Strength'].default_value=.001
    cloth['djcRole']='emissive-diffuser';cloth['dayEmissiveIntensity']=0.;cloth['nightEmissiveColor']='#ffc478';cloth['nightEmissiveIntensity']=1.4
    brass=material('DJC_Lantern_Brass','8e7950',.47,.72)
    dark=material('DJC_Lantern_Inset','343a34',.83,.1)
    return dict(wood=wood,cloth=cloth,brass=brass,dark=dark)

def uv_stock(o,long_axis=2,scale=.7,phase=0):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        dominant=max(range(3),key=lambda i:abs(p.normal[i]))
        axes=[i for i in range(3) if i!=dominant]
        if long_axis in axes:axes=[next(i for i in axes if i!=long_axis),long_axis]
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            layer.data[li].uv=(co[axes[0]]/scale+.17+phase,co[axes[1]]/scale+.31)

def box(name,loc,size,m,c,r=.002,axis=None,phase=0):
    o=put(craft_box(name,loc,size,m,r,3),c)
    uv_stock(o,max(range(3),key=lambda i:size[i]) if axis is None else axis,.7,phase);return o

def shade_panel(name,side,M,c):
    # A closed 3 mm fabric sandwich bows by 1.8 mm between timber supports.
    n=12;v=[];f=[];width=.184;bottom=.442;height=.254;edge=.094
    for depth in (0,.003):
        for row in range(n+1):
            for col in range(n+1):
                u=col/n;t=row/n;bow=.0018*math.sin(u*math.pi)*math.sin(t*math.pi)
                p=Vector(((u-.5)*width,-edge-bow+depth,bottom+height*t))
                a=side*math.pi/2;p=Vector((p.x*math.cos(a)-p.y*math.sin(a),p.x*math.sin(a)+p.y*math.cos(a),p.z));v.append(p)
    offset=(n+1)**2
    for row in range(n):
        for col in range(n):
            j=row*(n+1)+col;f.extend([(j,j+1,j+n+2,j+n+1),(offset+j+n+1,offset+j+n+2,offset+j+1,offset+j)])
    boundary=list(range(n+1))+[row*(n+1)+n for row in range(1,n+1)]+[n*(n+1)+col for col in range(n-1,-1,-1)]+[row*(n+1) for row in range(n-1,0,-1)]
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):f.append((a,b,b+offset,a+offset))
    o=mesh(name,v,f,M['cloth'],c);layer=o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        p.use_smooth=True
        for li in p.loop_indices:
            k=o.data.loops[li].vertex_index%offset;layer.data[li].uv=((k%(n+1))/n*width/.15,(k//(n+1))/n*height/.15)
    return o

def create_lantern(c,M):
    box('Raised plinth shoe',(0,0,.0275),(.30,.30,.055),M['wood'],c,.004,0)
    box('Inset shadow line above shoe',(0,0,.060),(.278,.278,.013),M['dark'],c,.001,0)
    for sx in (-1,1):
        for sy in (-1,1):
            box('Pedestal corner stile',(sx*.126,sy*.126,.209),(.036,.036,.307),M['wood'],c,.0025,2,phase=.09*(sx+2*sy))
    # Rebated panels meet the stiles. The narrow center joints describe paired boards.
    for side in range(4):
        a=side*math.pi/2
        for piece in (-1,1):
            x=piece*.0545;y=-.128
            o=box('Rebated pedestal board',(x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),.209),(.107,.024,.297),M['wood'],c,.0015,2,phase=.12*side+.035*piece)
            o.rotation_euler.z=a
        # One small dowel at each end of the bottom rail, physically in the join.
        for x in (-.119,.119):
            p=Vector((x,-.145,.090));p=Vector((p.x*math.cos(a)-p.y*math.sin(a),p.x*math.sin(a)+p.y*math.cos(a),p.z))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.0032,location=p)
            o=put(bpy.context.object,c);o.name='Flush timber fixing dowel';o.scale=(1,.38,1);o.rotation_euler.z=a;o.data.materials.append(M['wood']);uv_stock(o)
    box('Pedestal shoulder cap',(0,0,.381),(.288,.288,.044),M['wood'],c,.004,0)
    box('Lantern base recessed brass liner',(0,0,.408),(.244,.244,.011),M['brass'],c,.001,0)
    box('Lantern bottom structural tray',(0,0,.423),(.258,.258,.024),M['wood'],c,.002,0)
    for sx in (-1,1):
        for sy in (-1,1):
            box('Lamp solid corner post',(sx*.105,sy*.105,.565),(.027,.027,.314),M['wood'],c,.0015,2,phase=.06*sx+.12*sy)
            for z in (.444,.690):
                box('Post brass ferrule',(sx*.105,sy*.105,z),(.029,.029,.008),M['brass'],c,.0007,2)
    for z in (.439,.703):
        for side in range(4):
            a=side*math.pi/2
            o=box('Rebated shade perimeter rail',(0,-.105,z),(.210,.027,.014),M['wood'],c,.001,0,phase=side*.15)
            o.location.x=.105*math.sin(a);o.location.y=-.105*math.cos(a);o.rotation_euler.z=a
    for side in range(4):shade_panel('Linen diffuser panel %s'%side,side,M,c)
    box('Opaque lower shade pan',(0,0,.440),(.185,.185,.004),M['dark'],c,.0005,0)
    box('Upper shade canopy liner',(0,0,.699),(.190,.190,.006),M['dark'],c,.0005,0)
    box('Cap underside weather lip',(0,0,.723),(.31,.31,.014),M['wood'],c,.0025,0)
    # A closed four-sided sloping cap sheds rain; no floating top plate.
    v=[(sx*r,sy*r,z) for r,z in ((.151,.729),(.117,.762)) for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1))]
    f=[(3,2,1,0),(4,5,6,7)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
    o=mesh('Solid hipped timber rain cap',v,f,M['wood'],c);uv_stock(o,0)
    b=o.modifiers.new('Cap edge ease','BEVEL');b.width=.001;b.segments=2
    b=o.modifiers.new('Cap weighted face normals','WEIGHTED_NORMAL');b.keep_sharp=True
    box('Cap ridge crown',(0,0,.766),(.240,.240,.008),M['wood'],c,.0015,0)

def apply_parts(c):
    for o in c.objects:
        if o.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.uv_layers.active.name='UVMap'
    bpy.context.view_layer.update()

def stats(objects,closed=False):
    vertices=[];triangles=degenerate=0;nonmanifold=[];mats=set();meshes=0
    for o in objects:
        if o.type!='MESH':continue
        meshes+=1;me=o.data;me.calc_loop_triangles();mats.update(m.name for m in me.materials if m)
        vertices.extend(o.matrix_world@v.co for v in me.vertices);triangles+=len(me.loop_triangles)
        for t in me.loop_triangles:
            a,b,c=(me.vertices[i].co for i in t.vertices)
            if (b-a).cross(c-a).length<1e-12:degenerate+=1
        if closed:
            bm=bmesh.new();bm.from_mesh(me)
            if any(not e.is_manifold for e in bm.edges):nonmanifold.append(o.name)
            bm.free()
    lo=[min(p[k] for p in vertices) for k in range(3)];hi=[max(p[k] for p in vertices) for k in range(3)]
    return dict(meshes=meshes,triangles=triangles,materials=sorted(mats),bounds=[lo,hi],dimensions=[b-a for a,b in zip(lo,hi)],degenerate_triangles=degenerate,nonfinite_vertices=sum(not all(math.isfinite(p[k]) for k in range(3)) for p in vertices),nonmanifold_parts=nonmanifold)

def baseline(c):
    source=json.loads((OUT/'baseline-captured.json').read_text());origin=source['originWorld']
    for j,piece in enumerate(source['pieces']):
        color=piece['color'].lstrip('#');m=material('Baseline %02d %s'%(j,piece['kind']),color,.65 if piece['kind']=='amber' else .85)
        if piece['kind']=='amber':
            p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(*rgb('ffcf8d'),1);p.inputs['Emission Strength'].default_value=.08
        raw=piece['positions'];vertices=[(raw[i]-origin[0],origin[2]-raw[i+2],raw[i+1]-origin[1]) for i in range(0,len(raw),3)]
        # These are actual split production triangles. Preserve loop winding/order:
        # a volume-normal repair on disconnected triangles corrupts custom normals.
        me=bpy.data.meshes.new('Frozen actual source part %02d'%j)
        me.from_pydata(vertices,[],[tuple(range(i,i+3)) for i in range(0,len(vertices),3)]);me.update()
        o=bpy.data.objects.new(me.name,me);c.objects.link(o);me.materials.append(m)
        # Preserve original split vertex normals rather than smoothing the legacy source.
        for face in o.data.polygons:face.use_smooth=True
        ns=piece['normals'];o.data.normals_split_custom_set([(ns[i],-ns[i+2],ns[i+1]) for i in range(0,len(ns),3)])
    return source

def rig():
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24
    s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=3
    s.render.resolution_x=1200;s.render.resolution_y=1200;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
    s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=0
    s.world=bpy.data.worlds.new('Neutral inspection world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.71,.78,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.42
    c=collection('RIG | never exported');floor=material('Rig muted coastal stone','9a9c8c',.88)
    box('Review ground',(0,0,-.017),(200,200,.03),floor,c,0)
    for name,pos,power,size,color in [('Key',(1.5,-2.0,2.8),125,2.2,(1,.91,.78)),('Sky',(-1,1.5,2.1),85,2.5,(.77,.87,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        o=bpy.data.objects.new(name,data);c.objects.link(o);o.location=pos;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Frozen camera');cam=bpy.data.objects.new('Frozen camera',data);c.objects.link(cam);s.camera=cam
    return c

def camera(position=(1.2,-1.7,1.05),target=(0,0,.38),scale=.99):
    cam=bpy.context.scene.camera;cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale

def render(name,samples=24):
    s=bpy.context.scene;s.cycles.samples=samples;s.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)

def visible(c,value):
    c.hide_render=not value;c.hide_viewport=not value

def evening_view():
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[1].default_value=.12
    for o in bpy.context.scene.objects:
        if o.type=='LIGHT':o.data.energy*=.1
    for m in bpy.data.materials:
        if m.use_nodes and m.name.startswith('DJC_Lantern_Diffuser'):
            p=m.node_tree.nodes.get('Principled BSDF')
            # Match the runtime contract: replace the tiny daytime export factor,
            # and modulate emission with the existing linen color map.
            p.inputs['Emission Color'].default_value=(*rgb('ffc478'),1)
            if p.inputs['Base Color'].is_linked:
                mix=m.node_tree.nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
                mix.inputs[7].default_value=(*rgb('ffc478'),1)
                m.node_tree.links.new(p.inputs['Base Color'].links[0].from_socket,mix.inputs[6]);m.node_tree.links.new(mix.outputs[2],p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value=1.4
    render('lantern-evening-fresh-glb.png',32)

def preview():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    base=collection('BASELINE | actual frozen pool lantern');asset=collection('ASSET | editable pool lantern, origin base center')
    source=baseline(base);M=palette();create_lantern(asset,M);apply_parts(asset)
    native=stats(list(asset.objects),True)
    assert native['nonfinite_vertices']==0 and native['degenerate_triangles']==0,native
    assert not native['nonmanifold_parts'],native['nonmanifold_parts']
    assert native['bounds'][0][2]>=-1e-6 and native['bounds'][1][2]<=.77001,native
    assert native['dimensions'][0]<=.31001 and native['dimensions'][1]<=.31001,native
    rig();camera();visible(base,False);visible(asset,True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pool-lantern-editable.blend'))
    visible(base,True);visible(asset,False);render('lantern-before.png')
    visible(base,False);visible(asset,True);render('lantern-after.png')
    info=dict(source=source['description'],source_revision=source['source']['revision'],source_hashes=source['source']['sha256'],baseline_triangles=source['triangles'],native=native,blender=bpy.app.version_string,origin_world=source['originWorld'],placements=source['placements'],collision_contract=source['collisionContract'],coordinate_contract=dict(native='meters Z-up, +Y front',runtime='meters Y-up, -Z front',origin='base bottom center, world Y=1.4',maximum_runtime_dimensions=[.31,.77,.31]),render=dict(engine='Cycles CPU',threads=3,resolution=[1200,1200],view_transform='AgX',look='AgX - Medium High Contrast',exposure=0,overview=dict(position=[1.2,-1.7,1.05],target=[0,0,.38],ortho_scale=.99,samples=24),world=dict(color=[.64,.71,.78],strength=.42),area_lights=[dict(name=o.name,position=list(o.location),energy=o.data.energy,size=o.data.size,color=list(o.data.color)) for o in bpy.context.scene.objects if o.type=='LIGHT']))
    (OUT/'preview-validation.json').write_text(json.dumps(info,indent=2))
    print('PREVIEW_OK',json.dumps(native))

def runtime_asset(asset):
    runtime=collection('RUNTIME | four shared material primitives, UV1 AO')
    copies=[];materials={}
    for original in asset.objects:
        if original.type!='MESH':continue
        o=original.copy();o.data=original.data.copy();runtime.objects.link(o);copies.append(o)
        for i,m in enumerate(o.data.materials):
            if m.name not in materials:
                new=m.copy();new.name=m.name+'_Runtime';materials[m.name]=new
            o.data.materials[i]=materials[m.name]
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();o=bpy.context.object;o.name='DJC_Pool_Lantern'
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    uv=o.data.uv_layers.new(name='UV1_AO');o.data.uv_layers.active=uv
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    # Native connected topology is unwrapped before glTF UV/normal seam splitting.
    # Unwrap first; a pixel-sized margin in smart_project can collapse the atlas.
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=0,area_weight=.5)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=3/512)
    bpy.ops.object.mode_set(mode='OBJECT')
    ao=bpy.data.images.new('Pool lantern ambient occlusion UV1 512',width=512,height=512,alpha=False);ao.colorspace_settings.name='Non-Color'
    for m in materials.values():
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=ao;n.label='Independent UV1 AO atlas'
        m.node_tree.nodes.active=n;n.select=True
    visible(asset,False)
    bpy.context.scene.cycles.samples=32;bpy.context.scene.render.bake.margin=3
    bpy.ops.object.bake(type='AO',use_clear=True)
    # Edit-mode packing replaces the UV layer RNA backing data in Blender 5.1.
    # Fetch the live layer again before measuring it.
    uv=o.data.uv_layers['UV1_AO']
    o.data.calc_loop_triangles();uv_area=0.;surface_area=0.;cloth_uv_area=0.;cloth_surface_area=0.
    for tri in o.data.loop_triangles:
        a,b,c=(uv.data[li].uv for li in tri.loops);area=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2
        uv_area+=area;surface_area+=tri.area
        if o.data.materials[tri.material_index].name.startswith('DJC_Lantern_Diffuser'):
            cloth_uv_area+=area;cloth_surface_area+=tri.area
    assert uv_area>.18,('AO atlas coverage too low',uv_area)
    (OUT/'ao-validation.json').write_text(json.dumps(dict(atlas_size=[512,512],uv_area_fraction=uv_area,surface_area_m2=surface_area,mean_texels_per_meter=512*math.sqrt(uv_area/surface_area),cloth_uv_area_fraction=cloth_uv_area,cloth_surface_area_m2=cloth_surface_area,cloth_mean_texels_per_meter=512*math.sqrt(cloth_uv_area/cloth_surface_area),unwrap_source='Original connected Blender topology before export, no imported glTF unweld/split UV proxy',pack_margin_pixels=3,bake_margin_pixels=3),indent=2))
    ao.pack();ao.filepath_raw=str(OUT/'lantern-ao-uv1.png');ao.file_format='PNG';ao.save()
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for m in materials.values():
        n=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==ao)
        u=m.node_tree.nodes.new('ShaderNodeUVMap');u.uv_map='UV1_AO';m.node_tree.links.new(u.outputs['UV'],n.inputs['Vector'])
        g=m.node_tree.nodes.new('ShaderNodeGroup');g.node_tree=group;m.node_tree.links.new(n.outputs['Color'],g.inputs['Occlusion'])
    o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
    return runtime,o

def finish():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'pool-lantern-editable.blend'))
    asset=next(c for c in bpy.data.collections if c.name.startswith('ASSET |'))
    native=stats(list(asset.objects),True)
    runtime,obj=runtime_asset(asset);batched=stats([obj])
    assert batched['triangles']==native['triangles'] and len(batched['materials'])==4
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(OUT/'pool-lantern-v1.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    visible(runtime,False);visible(asset,True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pool-lantern-editable.blend'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'pool-lantern-v1.glb'))
    imported=[o for o in bpy.context.scene.objects if o.type=='MESH'];fresh=stats(imported)
    assert fresh['triangles']==native['triangles'] and len(fresh['materials'])==4
    assert fresh['nonfinite_vertices']==0 and fresh['degenerate_triangles']==0
    assert max(abs(a-b) for a,b in zip(fresh['dimensions'],native['dimensions']))<1e-5
    fresh_images=[dict(name=i.name,size=list(i.size),colorspace=i.colorspace_settings.name) for i in bpy.data.images if i.size[0]>0]
    rig();camera();render('lantern-after-fresh-glb.png')
    camera((.67,-.92,.84),(0,0,.584),.45);render('lantern-close-fresh-glb.png',32)
    bpy.context.view_layer.material_override=material('Rig neutral clay','b8b3a6',.75);camera();render('lantern-clay-fresh-glb.png')
    bpy.context.view_layer.material_override=None
    evening_view()
    blob=(OUT/'pool-lantern-v1.glb').read_bytes();size=int.from_bytes(blob[12:16],'little');gltf=json.loads(blob[20:20+size])
    assert not gltf.get('cameras') and 'KHR_lights_punctual' not in gltf.get('extensionsUsed',[])
    assert 'KHR_materials_transmission' not in gltf.get('extensionsUsed',[])
    assert len(gltf['materials'])==4 and all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in gltf['materials'])
    assert all(m.get('occlusionTexture',{}).get('texCoord')==1 for m in gltf['materials'])
    assert all(m['pbrMetallicRoughness'].get('baseColorTexture',{}).get('texCoord',0)==0 for m in gltf['materials'])
    diffuser=next(m for m in gltf['materials'] if m['name'].startswith('DJC_Lantern_Diffuser'))
    assert diffuser['extras']['djcRole']=='emissive-diffuser'
    assert max(diffuser.get('emissiveFactor',[0]))<.002,diffuser
    files=['pool-lantern-editable.blend','pool-lantern-v1.glb','lantern-before.png','lantern-after.png','lantern-after-fresh-glb.png','lantern-close-fresh-glb.png','lantern-clay-fresh-glb.png','lantern-evening-fresh-glb.png','lantern-ao-uv1.png','baseline-captured.json']
    info=json.loads((OUT/'preview-validation.json').read_text())
    info.update(runtime=batched,fresh_glb=fresh,ao=json.loads((OUT/'ao-validation.json').read_text()),glb_bytes=len(blob),fresh_images=fresh_images,extensions=gltf.get('extensionsUsed',[]),gltf_materials=gltf['materials'],hashes={f:hashlib.sha256((OUT/f).read_bytes()).hexdigest() for f in files},scripts={f:hashlib.sha256((TOOLS/f).read_bytes()).hexdigest() for f in ['build.py','capture-baseline.mjs','run.py']},close=dict(position=[.67,-.92,.84],target=[0,0,.584],ortho_scale=.45,samples=32),evening=dict(same_camera_as_overview=True,world_strength=.12,area_light_energy_multiplier=.1,diffuser_emission_strength=1.4,note='Offline emission/material stress view. No runtime light, browser parity or user approval claimed.'),verified=['Source captured from actual frozen release geometry.','Editable native parts closed, finite, nondegenerate, within original visible envelope.','Fresh glTF import matches triangles and dimensions, 4 opaque materials, separate UV1 AO, no transmission or lights.','No source collision or placement edits. Runtime integration, browser visual review and user acceptance remain primary-owned.'])
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2));print('FINISH_OK',json.dumps(dict(triangles=fresh['triangles'],materials=4,bytes=len(blob),dimensions=fresh['dimensions'])))

def evening_only():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'pool-lantern-v1.glb'))
    rig();camera();evening_view()
    info=json.loads((OUT/'manifest.json').read_text());info['hashes']['lantern-evening-fresh-glb.png']=hashlib.sha256((OUT/'lantern-evening-fresh-glb.png').read_bytes()).hexdigest()
    info['scripts']['build.py']=hashlib.sha256((TOOLS/'build.py').read_bytes()).hexdigest();info['scripts']['run.py']=hashlib.sha256((TOOLS/'run.py').read_bytes()).hexdigest()
    info['evening']['diffuser_emission_color']='#ffc478';info['evening']['diffuser_emission_map']='Existing linen baseColor map, multiplied by warm emission color as in runtime'
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2));print('EVENING_OK')

if __name__=='__main__':
    phase=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
    if phase=='finish':finish()
    elif phase=='evening':evening_only()
    else:preview()
