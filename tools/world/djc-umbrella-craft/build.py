"""Club parasol craft. Meters, Blender Z-up; root at pole bottom.

preview: native editable model plus exact-source same-rig before/after.
finish: derive four material batches, export Y-up once, fresh-import and render.
verify: inspect the saved final GLB without overwriting review images.
"""
import bpy, bmesh, math, sys, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
OUT=REPO/'docs/world/phase-2-playground/djc-umbrella-craft-20261101'
TEXTURES=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-phase2-integration/docs/world/phase-2-playground/djc-quality-pilot-20261101/textures')
sys.path.insert(0,'/Users/a22309/.codex/skills/blender-material-craft/scripts')
from craft_geometry import beam as craft_beam, box as craft_box, closed_lathe

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgb(h):return tuple(linear(int(h[k:k+2],16)/255) for k in (0,2,4))
def material(name,h,rough=.8,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb(h),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb(h),1);return m
def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def put(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);return o
def mesh(name,vertices,faces,m,c,smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);c.objects.link(o)
    if m:me.materials.append(m)
    for face in me.polygons:face.use_smooth=smooth
    return o
def uv(o,axes=(0,2),scale=1.6):
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            layer.data[li].uv=(co[axes[0]]/scale+.13,co[axes[1]]/scale+.23)
def lathe(name,profile,m,c,sides=48):
    o=put(closed_lathe(name,profile,material=m,sides=sides),c)
    layer=o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        center=sum((o.data.vertices[k].co for k in p.vertices),Vector())/len(p.vertices)
        base=math.atan2(center.y,center.x)
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            if abs(p.normal.z)>.75:pair=(co.x/1.6+.13,co.y/1.6+.23)
            else:
                a=base+math.atan2(math.sin(math.atan2(co.y,co.x)-base),math.cos(math.atan2(co.y,co.x)-base))
                pair=(a*.065/1.6+.13,co.z/1.6+.23)
            layer.data[li].uv=pair
    return o
def tube(name,points,r,m,c,cyclic=False,sides=8):
    points=[Vector(p) for p in points];v=[];f=[];n=len(points)
    for j,p in enumerate(points):
        a=points[(j-1)%n] if cyclic or j else points[j]
        b=points[(j+1)%n] if cyclic or j<n-1 else points[j]
        t=(b-a).normalized();ref=Vector((0,0,1)) if abs(t.z)<.95 else Vector((0,1,0))
        u=t.cross(ref).normalized();w=t.cross(u).normalized()
        v.extend(p+r*(u*math.cos(k*math.tau/sides)+w*math.sin(k*math.tau/sides)) for k in range(sides))
    for j in range(n if cyclic else n-1):
        for k in range(sides):f.append((j*sides+k,j*sides+(k+1)%sides,((j+1)%n)*sides+(k+1)%sides,((j+1)%n)*sides+k))
    if not cyclic:f.extend([tuple(reversed(range(sides))),tuple((n-1)*sides+k for k in range(sides))])
    o=mesh(name,v,f,m,c,True);uv(o);return o
def beam(name,a,b,w,d,m,c,bevel=.002):
    o=put(craft_beam(name,a,b,w,d,m,bevel),c);uv(o,(0,2));return o
def image(name,values,noncolor=False):
    h,w=values.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    if noncolor:im.colorspace_settings.name='Non-Color'
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=values;im.pixels.foreach_set(rgba.ravel());im.pack();return im
def connect(m,im,socket):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs[socket])
def normal(m,im,strength):
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
    q=m.node_tree.nodes.new('ShaderNodeNormalMap');q.inputs['Strength'].default_value=strength
    m.node_tree.links.new(n.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],m.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
def palette():
    wood=material('03 Un-tinted oiled timber | CC0 photograph','ffffff',.66)
    sources=[]
    expected={'wood_diff.jpg':'5da68c7ebe8732f029ecbd602cb0d86d2a271e32539df953a0f10efa052b9516','wood_nor_gl.jpg':'fc9f1d2600e7686504b36d805b79bd785a327b752a3e7943a41e7d6e9bdfe399'}
    for filename,space,socket in [('wood_diff.jpg','sRGB','Base Color'),('wood_nor_gl.jpg','Non-Color',None)]:
        path=TEXTURES/filename;digest=hashlib.sha256(path.read_bytes()).hexdigest();assert digest==expected[filename]
        im=bpy.data.images.load(str(path));im.colorspace_settings.name=space;im.scale(1024,1024);im.pack()
        if socket:connect(wood,im,socket)
        else:normal(wood,im,.28)
        suffix='diff' if socket else 'nor_gl'
        sources.append(dict(filename=filename,sha256=digest,license='CC0',asset_url='https://polyhaven.com/a/wood_table_001',source_url='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/wood_table_001/wood_table_001_'+suffix+'_4k.jpg',license_url='https://polyhaven.com/license',usage='Read-only approved local photograph; 1024px derivative packed'))
    cloth=material('01 Sand canvas | tailored tension panels','ffffff',.91)
    binding=material('02 Folded canvas binding and lock stitches','d2c29e',.91)
    metal=material('04 Aged joint metal | hinge pins and sleeve','454940',.46,.65)
    size=1024;y,x=np.mgrid[:size,:size]/size
    a=x*math.tau*300;b=y*math.tau*300
    threads=.5+.25*np.sin(a)+.25*np.sin(b)
    values=np.array(rgb('cabc9e'))[None,None,:]*(.965+.035*threads[:,:,None])
    connect(cloth,image('Authored neutral sand canvas color 1024',values),'Base Color')
    connect(cloth,image('Authored canvas roughness 1024',np.repeat((.88+.08*(1-threads))[:,:,None],3,2),True),'Roughness')
    n=np.dstack((.075*np.cos(a),.075*np.cos(b),np.ones_like(a)));n/=np.linalg.norm(n,axis=2)[:,:,None]
    normal(cloth,image('Authored restrained canvas normal 1024',n*.5+.5,True),.5)
    (OUT/'texture-sources.json').write_text(json.dumps(sources+[dict(source='Deterministically authored by build.py',usage='Canvas maps; 0.6m tile, 2mm thread pitch; not a scan')],indent=2))
    return dict(wood=wood,cloth=cloth,binding=binding,metal=metal)

def canopy_point(panel,t,s):
    """Low dome, not cone; broad radial curvature and a bounded between-rib sag."""
    angle=(panel+s)*math.tau/8
    radius=.059+(1.637-.059)*t-.036*math.sin(math.pi*s)*t**3
    z=2.797-.607*t**1.45-.020*math.sin(math.pi*s)*math.sin(math.pi*t)
    return Vector((radius*math.cos(angle),radius*math.sin(angle),z))
def fabric_panel(index,c,M):
    radial,across=28,12;v=[];f=[]
    for side in (0,1):
        for j in range(radial+1):
            for k in range(across+1):
                p=canopy_point(index,j/radial,k/across);p.z-=side*.0025;v.append(p)
    count=(radial+1)*(across+1)
    for side in (0,1):
        off=side*count
        for j in range(radial):
            for k in range(across):
                a=off+j*(across+1)+k;f.append((a,a+1,a+across+2,a+across+1))
    edge=list(range(across+1))+[j*(across+1)+across for j in range(1,radial+1)]+[radial*(across+1)+k for k in range(across-1,-1,-1)]+[j*(across+1) for j in range(radial-1,0,-1)]
    for a,b in zip(edge,edge[1:]+edge[:1]):f.append((a,b,b+count,a+count))
    o=mesh('Canvas gore %02d | closed 2.5mm tailored sheet'%(index+1),v,f,M['cloth'],c,True)
    # Each cut gore has its warp oriented radially, rather than one world map
    # crossing all eight seams. Keep the same real cloth scale on both faces.
    layer=o.data.uv_layers.new(name='UVMap');angle=(index+.5)*math.tau/8
    ca,sa=math.cos(angle),math.sin(angle)
    for p in o.data.polygons:
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            layer.data[li].uv=((co.x*ca+co.y*sa)/.6+.13,(-co.x*sa+co.y*ca)/.6+.23)
    return o
def curved_rib(index,c,M):
    theta=index*math.tau/8;lateral=Vector((-math.sin(theta),math.cos(theta),0));v=[];f=[];lengths=[0]
    points=[]
    for j in range(25):
        t=.005+.982*j/24;p=canopy_point(index,t,0);p.z-=.0107;points.append(p)
        if j:lengths.append(lengths[-1]+(points[-1]-points[-2]).length)
    for j,p in enumerate(points):
        tangent=(points[min(j+1,24)]-points[max(0,j-1)]).normalized();up=tangent.cross(lateral).normalized()
        v.extend([p+lateral*.011+up*.0085,p-lateral*.011+up*.0085,p-lateral*.011-up*.0085,p+lateral*.011-up*.0085])
    for j in range(24):
        for k in range(4):f.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
    f.extend([(3,2,1,0),(96,97,98,99)])
    o=mesh('Curved timber rib %02d | crown to tip pocket'%(index+1),v,f,M['wood'],c)
    layer=o.data.uv_layers.new(name='UVMap')
    # Each ring follows the bent timber, grain direction always along the rib.
    for p in o.data.polygons:
        for li in p.loop_indices:
            vi=o.data.loops[li].vertex_index;layer.data[li].uv=((vi%4)*.018/1.6+.13,lengths[vi//4]/1.6+.23)
    mod=o.modifiers.new('Soft finished rib edges','BEVEL');mod.width=.0012;mod.segments=2
    o.modifiers.new('Weighted rib face normals','WEIGHTED_NORMAL')
    return o
def build_asset(c,M):
    lathe('Tapered central timber pole | original bottom root',[(0,0),(.062,0),(.065,.025),(.065,.09),(.050,2.74),(.050,2.791),(0,2.791)],M['wood'],c,48)
    lathe('Upper fixed crown | captures eight ribs',[(.049,2.738),(.082,2.738),(.090,2.752),(.090,2.771),(.075,2.785),(.049,2.785)],M['wood'],c,48)
    lathe('Low timber finial | broad rounded cap',[(0,2.777),(.076,2.777),(.079,2.79),(.071,2.808),(.050,2.820),(.022,2.825),(0,2.825)],M['wood'],c,48)
    lathe('Sliding metal runner | surrounds timber pole',[(.055,1.872),(.080,1.872),(.087,1.884),(.087,1.924),(.076,1.941),(.055,1.941)],M['metal'],c,48)
    lathe('Runner lower grip collar',[(.054,1.834),(.072,1.834),(.076,1.842),(.076,1.87),(.054,1.87)],M['wood'],c,40)
    connections=[]
    for i in range(8):
        fabric_panel(i,c,M);curved_rib(i,c,M)
        theta=i*math.tau/8;radial=Vector((math.cos(theta),math.sin(theta),0));side=Vector((-math.sin(theta),math.cos(theta),0))
        top=canopy_point(i,.47,0);top.z-=.035
        bottom=radial*.081+Vector((0,0,1.908))
        beam('Opening stretcher %02d | pin to pin'%(i+1),bottom,top,.018,.022,M['wood'],c,.002)
        for label,point in [('runner',bottom),('rib',top)]:
            # Twin ears enclose the strut; a transverse pin intersects all three.
            for sign in (-1,1):
                center=point+side*sign*.016
                o=put(craft_box('Hinge %02d %s ear %s'%(i+1,label,sign),center,(.022,.009,.043),M['metal'],.002,2),c)
                o.rotation_euler.z=theta;uv(o)
            tube('Hinge %02d %s through-pin'%(i+1,label),[point-side*.025,point+side*.025],.0045,M['metal'],c,False,12)
        # Rib-side ear extends to the rib underface and physically meets it.
        beam('Rib hinge %02d contact shoe'%(i+1),top,top+Vector((0,0,.028)),.022,.022,M['metal'],c,.001)
        seam=[canopy_point(i,t,0)+Vector((0,0,.0018)) for t in np.linspace(.035,.975,34)]
        tube('Radial panel seam %02d'%(i+1),seam,.0022,M['binding'],c,False,6)
        for j,t in enumerate(np.linspace(.08,.94,29)):
            for offset in (-.005,.005):
                a=canopy_point(i,t,0)+side*offset+Vector((0,0,.0003))
                b=canopy_point(i,min(t+.004,1),0)+side*offset+Vector((0,0,.0003))
                tube('Gore %02d stitch %02d %s'%(i+1,j,'L' if offset<0 else 'R'),[a,b],.00065,M['binding'],c,False,5)
        # Closed canvas pocket envelops the rib end beneath the fabric edge.
        surface=canopy_point(i,.974,0)
        tangent=(canopy_point(i,.979,0)-canopy_point(i,.969,0)).normalized()
        face_normal=tangent.cross(side).normalized()
        p=surface-face_normal*.0175
        o=put(craft_box('Reinforced rib tip pocket %02d'%(i+1),p,(.065,.043,.029),M['binding'],.006,3),c)
        o.rotation_mode='QUATERNION';o.rotation_quaternion=Matrix((tangent,side,face_normal)).transposed().to_quaternion();uv(o,(0,1),.6)
        connections.append(dict(index=i,runner_pin=list(bottom),rib_pin=list(top),stretcher_endpoint_gap_m=0))
    edge=[]
    for i in range(8):
        for s in np.linspace(0,1,24,endpoint=False):
            p=canopy_point(i,1,float(s));p.z=2.181;edge.append(p)
    tube('Continuous folded canvas hem | 12mm corded edge',edge,.006,M['binding'],c,True,8)
    # Visible transverse locking pin belongs to the sleeve, not a floating detail.
    tube('Runner locking pin',[(-.10,0,1.885),(.10,0,1.885)],.004,M['metal'],c,False,12)
    return connections

def apply_parts(c):
    for o in c.objects:
        if o.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        assert len(o.data.uv_layers)==1,o.name
        o.data.uv_layers.active.name='UVMap'
    bpy.context.view_layer.update()
def stats(objects,volumes=False):
    coords=[];tris=0;bad=0;deg=0;open_parts=[];materials=set()
    for o in objects:
        if o.type!='MESH':continue
        me=o.data;me.calc_loop_triangles();tris+=len(me.loop_triangles)
        coords.extend(tuple(o.matrix_world@v.co) for v in me.vertices)
        bad+=sum(not all(math.isfinite(x) for x in v.co) for v in me.vertices)
        deg+=sum(t.area<1e-12 for t in me.loop_triangles)
        materials.update(m.name for m in me.materials if m)
        if volumes:
            bm=bmesh.new();bm.from_mesh(me)
            if any(not e.is_manifold for e in bm.edges):open_parts.append(o.name)
            bm.free()
    low=[min(v[k] for v in coords) for k in range(3)];high=[max(v[k] for v in coords) for k in range(3)]
    return dict(meshes=sum(o.type=='MESH' for o in objects),triangles=tris,materials=sorted(materials),bounds_min=low,bounds_max=high,dimensions=[b-a for a,b in zip(low,high)],max_horizontal_radius=max(math.hypot(v[0],v[1]) for v in coords),nonfinite_vertices=bad,degenerate_triangles=deg,nonmanifold_parts=open_parts)
def validate(s):
    assert s['nonfinite_vertices']==0 and s['degenerate_triangles']==0,s
    assert s['max_horizontal_radius']<=1.65001,s['max_horizontal_radius']
    assert abs(s['bounds_min'][2])<1e-5 and s['bounds_max'][2]<=2.82501,s
def import_baseline(c):
    data=json.loads((OUT/'baseline-captured.json').read_text())
    for i,p in enumerate(data['pieces']):
        m=material('SOURCE '+p['kind'],p['color'].lstrip('#'),.85 if p['kind']=='wood' else .94)
        v=p['positions'];vertices=[(v[k]-74,47-v[k+2],v[k+1]-1.4) for k in range(0,len(v),3)]
        me=bpy.data.meshes.new('Exact source triangles');me.from_pydata(vertices,[],[(k,k+1,k+2) for k in range(0,len(vertices),3)]);me.update()
        o=bpy.data.objects.new('Actual source '+p['kind'],me);c.objects.link(o);me.materials.append(m)
        for face in me.polygons:face.use_smooth=True
        n=p['normals'];me.normals_split_custom_set([(n[k],-n[k+2],n[k+1]) for k in range(0,len(n),3)])
    return data
def rig():
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.engine='CYCLES'
    scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=1280;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
    if not scene.world:scene.world=bpy.data.worlds.new('Neutral coastal studio')
    scene.world.color=(.20,.20,.20)
    c=collection('PRESENTATION | never exported')
    put(craft_box('Studio ground',(0,0,-.018),(200,200,.025),material('RIG sand','a6a99c',.94),0),c)
    for name,loc,power,size,col in [('Sea window',(0,3.8,6),800,4.2,(.87,.95,1)),('Warm side',(4,-1,4),600,3.5,(1,.85,.64)),('Soft rear rim',(-3,-3,4),650,3.2,(.83,.96,1))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=col
        o=bpy.data.objects.new(name,data);c.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Frozen review camera');cam=bpy.data.objects.new('Frozen review camera',data);c.objects.link(cam);scene.camera=cam
def camera(pos=(4.4,5.6,3.5),target=(0,0,1.5),scale=4.15):
    cam=bpy.context.scene.camera;cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale
def render(name,samples=24):
    scene=bpy.context.scene;scene.cycles.samples=samples;scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
def preview():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    baseline=collection('BASELINE | captured real source umbrella 74 47')
    asset=collection('ASSET | Club umbrella | root pole bottom')
    source=import_baseline(baseline);M=palette();connections=build_asset(asset,M);apply_parts(asset)
    native=stats(list(asset.objects),True);validate(native);assert not native['nonmanifold_parts'],native['nonmanifold_parts']
    rig();camera();baseline.hide_render=True;asset.hide_render=False
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'umbrella-editable.blend'))
    baseline.hide_render=False;asset.hide_render=True;render('umbrella-before.png')
    baseline.hide_render=True;asset.hide_render=False;render('umbrella-after.png')
    camera((2.8,3.8,1.05),(0,0,2.26),2.35);render('umbrella-structure-preview.png',24)
    info=dict(status='preview_built_not_visually_accepted',source=source['description'],source_hashes=source['sourceHashes'],baseline_triangles=source['triangles'],native=native,connections=connections,origin_world=[74,1.4,47],instances_world=[[74,1.4,47],[74,1.4,63]],front_world=[0,0,-1],blender=bpy.app.version_string,render=dict(engine='Cycles CPU',threads=4,resolution=[1280,1100],view_transform='AgX',look='AgX - Medium High Contrast',exposure=0,camera=[4.4,5.6,3.5],target=[0,0,1.5],ortho_scale=4.15,samples=24),ao='absent',browser_validation='not performed')
    (OUT/'preview-validation.json').write_text(json.dumps(info,indent=2));print('PREVIEW_OK',json.dumps(native))
def batch_runtime(asset):
    runtime=collection('RUNTIME | four physical material batches');groups={}
    for source in asset.objects:
        if source.type!='MESH':continue
        o=source.copy();o.data=source.data.copy();runtime.objects.link(o);groups.setdefault(o.data.materials[0].name,[]).append(o)
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        o=bpy.context.object;o.name='DJC_Umbrella_'+name[:2]+'_'+name[3:].split(' |')[0].replace(' ','_')
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return runtime
def finish(verify=False):
    info=json.loads((OUT/'preview-validation.json').read_text())
    if not verify:
        bpy.ops.wm.open_mainfile(filepath=str(OUT/'umbrella-editable.blend'))
        asset=next(c for c in bpy.data.collections if c.name.startswith('ASSET |'))
        native=stats(list(asset.objects),True);validate(native)
        runtime=batch_runtime(asset);batched=stats(list(runtime.objects));assert batched['triangles']==native['triangles']
        bpy.ops.object.select_all(action='DESELECT')
        for o in runtime.objects:o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(OUT/'umbrella.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
        info['runtime']=batched
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'umbrella.glb'))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];fresh=stats(objects);validate(fresh)
    assert fresh['triangles']==info['native']['triangles'] and fresh['meshes']==4
    assert fresh['materials']==info['native']['materials']
    assert max(abs(a-b) for a,b in zip(fresh['dimensions'],info['native']['dimensions']))<1e-5
    blob=(OUT/'umbrella.glb').read_bytes();length=int.from_bytes(blob[12:16],'little');gltf=json.loads(blob[20:20+length])
    assert len(gltf['materials'])==4 and len(gltf['meshes'])==4
    assert not gltf.get('cameras') and not gltf.get('animations')
    assert not any('KHR_lights_punctual' in n.get('extensions',{}) for n in gltf.get('nodes',[]))
    assert 'KHR_materials_transmission' not in gltf.get('extensionsUsed',[])
    for node in gltf['nodes']:
        assert node.get('translation',[0,0,0])==[0,0,0],node
        assert node.get('rotation',[0,0,0,1])==[0,0,0,1],node
        assert node.get('scale',[1,1,1])==[1,1,1],node
        assert 'matrix' not in node,node
    for m in gltf['materials']:
        assert m.get('alphaMode','OPAQUE')=='OPAQUE'
        assert not m.get('occlusionTexture'),'AO not part of this build'
        if m['name'].startswith(('01','03')):assert m['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1])==[1,1,1,1]
    for im in gltf['images']:assert 'bufferView' in im and 'uri' not in im
    images=[dict(name=im.name,size=list(im.size),colorspace=im.colorspace_settings.name) for im in bpy.data.images if im.size[0]>0]
    assert all(max(im['size'])<=1024 for im in images),images
    if not verify:
        rig();camera((2.8,3.8,1.05),(0,0,2.26),2.35);render('umbrella-close-fresh-glb.png',32)
        camera((3.5,4.5,4.4),(0,0,2.4),3.65);render('umbrella-top-fresh-glb.png',24)
        bpy.context.view_layer.material_override=material('RIG neutral clay','b8b3a6',.73);camera();render('umbrella-clay.png')
    files=['umbrella-editable.blend','umbrella.glb','umbrella-before.png','umbrella-after.png','umbrella-close-fresh-glb.png','umbrella-top-fresh-glb.png','umbrella-clay.png','baseline-captured.json']
    info.update(status='candidate_technical_checks_complete',fresh_glb=fresh,glb_bytes=len(blob),embedded_images=len(gltf.get('images',[])),fresh_images=images,extensions=gltf.get('extensionsUsed',[]),top_level_nodes=gltf['nodes'],materials=gltf['materials'],hashes={p:hashlib.sha256((OUT/p).read_bytes()).hexdigest() for p in files},scripts={p:hashlib.sha256((HERE/p).read_bytes()).hexdigest() for p in ['build.py','capture-baseline.mjs','run.py']},images_inspected=False,browser_validation='not performed',limits=['Offline images are source-faithful studio comparison, not production screenshots.','No runtime performance or user visual acceptance claimed.','Native named parts remain separate; runtime derivative merges by physical material.'])
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2));print('VERIFY_OK' if verify else 'FINISH_OK',json.dumps(dict(triangles=fresh['triangles'],meshes=fresh['meshes'],bytes=len(blob),bounds=[fresh['bounds_min'],fresh['bounds_max']])))

if __name__=='__main__':
    phase=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
    if phase=='preview':preview()
    elif phase=='finish':finish()
    elif phase=='verify':finish(True)
    else:raise SystemExit('Unknown phase '+phase)
