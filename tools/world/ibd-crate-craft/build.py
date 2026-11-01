"""IBD crate: editable construction; coordinates authored in Three Y-up metres."""
import bpy, math, json, sys, hashlib, struct
from pathlib import Path
from mathutils import Vector
import numpy as np
TOOLS=Path(__file__).resolve().parent
OUT=TOOLS.parents[2]/'docs/world/phase-2-playground/ibd-crate-craft-20261101'
PIVOT=(0,1.08,-1.25)
M={}; C=None; COUNTER=0
def p(a): return Vector((a[0],-a[2],a[1]))
def collection(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
def move(o,c):
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o);return o
def visible(c,v):
    c.hide_render=not v;c.hide_viewport=not v
def material(name,color,rough,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    q=m.node_tree.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*color,1)
    q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal
    return m
def mesh(name,verts,faces,mat):
    d=bpy.data.meshes.new(name);d.from_pydata([p(v) for v in verts],[],faces);d.update()
    o=bpy.data.objects.new(name,d);C.objects.link(o);d.materials.append(mat);return o
def select(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def cube(name,at,dims,mat,bevel=.008,grain=0):
    global COUNTER
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(at));o=move(bpy.context.object,C);o.name=name
    o.dimensions=(dims[0],dims[2],dims[1]);select(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(M[mat])
    if mat=='wood':o.data.materials.append(M['endwood'])
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UV0')
    g=[0,2,1][grain];offset=(COUNTER*.137)%1;COUNTER+=1
    for face in o.data.polygons:
        n=face.normal;normalaxis=max(range(3),key=lambda i:abs(n[i]));u=g if normalaxis!=g else (g+1)%3
        if mat=='wood' and normalaxis==g:face.material_index=1
        v=next(i for i in range(3) if i!=normalaxis and i!=u)
        for li in face.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            # Source is a .7m photographed pine field; each board samples its own cut.
            flip=-1 if COUNTER%3==0 else 1
            across=(co[v]/o.dimensions[v]+.5)*.70+.03+(COUNTER%4)*.07
            if mat=='wood' and normalaxis==g:
                uv.data[li].uv=((co[u]/o.dimensions[u]+.5)*.24+(COUNTER*.217)% .7,(co[v]/o.dimensions[v]+.5)*.24+(COUNTER*.137)% .7)
            else:uv.data[li].uv=(flip*co[u]/1.8+offset,across)
    if bevel:
        mod=o.modifiers.new('Manufactured eased edge','BEVEL');mod.width=min(bevel,min(dims)*.22);mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted plane normals','WEIGHTED_NORMAL');mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def rod(name,a,b,r,mat,sides=16):
    a=Vector(a);b=Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0))
    u=axis.cross(ref).normalized();v=axis.cross(u);verts=[]
    for pt in [a,b]:
        verts.extend([pt+r*(math.cos(i*2*math.pi/sides)*u+math.sin(i*2*math.pi/sides)*v) for i in range(sides)])
    faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    faces.extend([(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)])
    return mesh(name,verts,faces,M[mat])
def lathe_x(name,x,y,z,profile,mat,sides=32):
    closed=profile[0]==profile[-1]
    if closed:profile=profile[:-1]
    verts=[(x+t,y+r*math.cos(i*2*math.pi/sides),z+r*math.sin(i*2*math.pi/sides)) for t,r in profile for i in range(sides)]
    faces=[]
    for j in range(len(profile) if closed else len(profile)-1):
        nxt=(j+1)%len(profile)
        for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,nxt*sides+(i+1)%sides,nxt*sides+i))
    o=mesh(name,verts,faces,M[mat])
    for q in o.data.polygons:q.use_smooth=True
    return o
def hinge_sleeve(x):
    # Half barrel wraps the true z=0 hinge axis without extending the frozen lid bounds.
    outline=[]
    for r,steps in [(.031,range(17)),(.015,range(16,-1,-1))]:
        outline.extend([(r*math.cos(i*math.pi/16),r*math.sin(i*math.pi/16)) for i in steps])
    n=len(outline);verts=[(xx,y,z) for xx in [x-.13,x+.13] for y,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend([(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    return mesh('True-axis split hinge sleeve',verts,faces,M['metal'])
def texture(name,array,space='sRGB'):
    h,w=array.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=False);im.colorspace_settings.name=space
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=array;im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
def materials():
    M.update(wood=material('IBD | light sawn timber',(.62,.44,.25),.76),endwood=material('IBD | cut timber endgrain',(.62,.44,.25),.84),metal=material('IBD | formed galvanized steel',(.48,.56,.59),.43,.78),
      rubber=material('IBD | charcoal rubber',(.022,.029,.031),.91),blue=material('IBD | muted blue webbing',(.12,.24,.30),.79),
      amber=material('IBD | amber lid straps',(.78,.42,.045),.66),cream=material('IBD | retained label card',(.80,.78,.67),.84),
      ink=material('IBD | retained label ink',(.028,.045,.052),.78))
    images=[]
    for filename,space in [('pine-packaging-basecolor.png','sRGB'),('pine-packaging-roughness.png','Non-Color'),('pine-packaging-normal.png','Non-Color')]:
        im=bpy.data.images.load(str(TOOLS/'textures'/filename));im.colorspace_settings.name=space;im.pack();images.append(im)
    im,rough,normal=images
    m=M['wood'];nodes=m.node_tree.nodes;links=m.node_tree.links;q=nodes.get('Principled BSDF')
    for image,inputname in [(im,'Base Color'),(rough,'Roughness')]:
        n=nodes.new('ShaderNodeTexImage');n.image=image;links.new(n.outputs['Color'],q.inputs[inputname])
    n=nodes.new('ShaderNodeTexImage');n.image=normal;b=nodes.new('ShaderNodeNormalMap');b.inputs['Strength'].default_value=.22
    links.new(n.outputs['Color'],b.inputs['Color']);links.new(b.outputs['Normal'],q.inputs['Normal'])
    yy,xx=np.mgrid[0:512,0:512].astype(np.float32)/512
    radius=np.sqrt((xx+.8)**2*.8+(yy-1.6)**2*1.2)
    warped=radius+.017*np.sin(xx*15+yy*11)+.007*np.sin(xx*37-yy*17)
    phase=warped*90+3*np.sin(warped*5)
    rings=-.014*((np.sin(phase)*.5+.5)**6)+.003*np.sin(xx*171+yy*57)
    end=texture('crate-wood-endgrain',np.stack([.64+rings,.50+rings,.33+rings*.7],axis=-1))
    m=M['endwood'];n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=end
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
def shell():
    for x in [-1.2,0,1.2]:cube('Pallet longitudinal bearer',(x,-.06,0),(.35,.18,2.7),'wood',.014,2)
    cube('Load distributing steel chassis',(0,-.3,0),(2.8,.15,2.3),'metal',.018)
    for z in [-1,-.5,0,.5,1]:cube('Pallet deck board',(0,.06,z),(3,.12,.4),'wood',.008)
    cube('Protected internal base',(0,.23,0),(2.7,.2,2.4),'rubber',.018)
    for x in [-1.35,1.35]:
        for j in range(3):cube('Side horizontal plank',(x,.62+(j-1)*.283,0),(.12,.279,2.5),'wood',.006,2)
    for z in [-1.22,1.22]:
        for j in range(3):cube('End horizontal plank',(0,.62+(j-1)*.283,z),(2.7,.279,.12),'wood',.006,0)
    for x in [-1.35,1.35]:cube('Original rim top datum',(x,1.0275,0),(.12,.035,2.5),'wood',.004,2)
    # Original corner and center battens occupy the same external envelope.
    for x in [-1.44,1.44]:
        for z in [-1.16,1.16]:cube('Side corner timber batten',(x,.6,z),(.06,.72,.15),'wood',.005,1)
        cube('Side center timber batten',(x,.6,0),(.06,.72,.09),'wood',.005,1)
    for z in [-1.295,1.295]:
        for y in [.26,.94]:cube('Front back horizontal rail',(0,y,z),(2.72,.1,.035),'wood',.005)
        # Proud posts form a real lap over rails; identical front planes made black coplanar patches.
        for x in [-1.27,1.27]:cube('Front back corner post',(x,.62,math.copysign(1.30,z)),(.09,.74,.045),'wood',.004,1)
    # Folded galvanized corners meet both boards; all stay in old visible bounds.
    for x in [-1.38,1.38]:
        for z in [-1.25,1.25]:
            sx=1 if x>0 else -1;sz=1 if z>0 else -1
            cube('Folded corner plate side',(sx*1.414,.63,sz*1.18),(.012,.64,.16),'metal',.002)
            cube('Folded corner plate end',(sx*1.34,.63,sz*1.286),(.16,.64,.012),'metal',.002)
            for y in [.37,.87]:
                rod('Corner through bolt',(sx*1.425,y,sz*1.18),(sx*1.436,y,sz*1.18),.024,'metal',6)
                rod('Corner bolt end',(sx*1.34,y,sz*1.298),(sx*1.34,y,sz*1.31),.024,'metal',6)
    for x in [-.88,.88]:
        cube('Retained front webbing',(x,.6,1.289),(.055,.77,.012),'blue',.002,1)
        cube('Retained strap buckle',(x,.78,1.3075),(.09,.1,.025),'metal',.004)
        cube('Buckle center webbing',(x,.78,1.322),(.042,.06,.006),'blue',.001)
    for x in [-1.415,1.415]:
        for y in [.32,.92]:cube('Retained side restraint',(x,y,0),(.018,.035,2.28),'blue',.003,2)
    for sx in [-.65,.65]:
        for sz in [-.55,.55]:
            for side in [-1,1]:cube('Original slot fork-channel pad',(sx+side*.28,.37,sz+.05),(.24,.1,.5),'rubber',.008,2)
    cube('Retained M8 four unit label',(0,.64,1.3),(.95,.44,.04),'cream',.012)
    strokes=[((-.36,.53),(-.36,.75)),((-.36,.75),(-.25,.63)),((-.25,.63),(-.14,.75)),((-.14,.75),(-.14,.53)),
      ((-.03,.53),(-.03,.75)),((.1,.53),(.1,.75)),((-.03,.53),(.1,.53)),((-.03,.64),(.1,.64)),((-.03,.75),(.1,.75)),
      ((.3,.75),(.23,.62)),((.23,.62),(.39,.62)),((.35,.75),(.35,.53))]
    for a,b in strokes:rod('Retained exact M8 4 ink stroke',(*a,1.33),(*b,1.33),.013,'ink',4)
    cube('Original hoist stub base',(1.18,.33,-.95),(.18,.12,.18),'blue',.004)
    rod('Original stowed hoist stub',(1.18,.35,-.95),(1.18,.96,-.95),.055,'metal',16)
    for y in [.4,.9]:cube('Original hoist stub collar',(1.18,y,-.95),(.15,.08,.15),'ink',.004)
    for x in [-1.2,1.2]:
        for z in [-.9,.9]:
            cube('Caster mounting plate',(x,-.395,z),(.33,.04,.32),'metal',.006)
            rod('Caster swivel bearing',(x,-.43,z),(x,-.38,z),.103,'metal',24)
            for side in [-1,1]:
                cube('Caster wheel fork cheek',(x+side*.116,-.588,z),(.032,.31,.19),'metal',.011,1)
                rod('Caster axle cap',(x+side*.132,-.75,z),(x+side*.145,-.75,z),.043,'metal',6)
            lathe_x('Rounded rubber caster tire',x,-.75,z,[(-.09,.137),(-.09,.213),(-.073,.247),(-.052,.26),(-.035,.26),(-.029,.255),(-.023,.26),(.023,.26),(.029,.255),(.035,.26),(.052,.26),(.073,.247),(.09,.213),(.09,.137),(-.09,.137)],'rubber')
            lathe_x('Recessed pressed wheel hub',x,-.75,z,[(-.093,.047),(-.093,.09),(-.082,.14),(.082,.14),(.093,.09),(.093,.047),(-.093,.047)],'metal',24)
            # Shaft ends inside fork cheeks; caps own the exposed outer face without coincident discs.
            rod('Wheel through axle',(x-.123,-.75,z),(x+.123,-.75,z),.035,'metal',16)
def lid():
    # Local y is zero at runtime hinge. Do not bake PIVOT into these coordinates.
    # Recess underside over the fixed rim; original visible envelope remains exact.
    for j in range(7):
        x=-1.41+(j+.5)*2.82/7
        width=2.82/7-.004
        if j==0:x-=.001;width+=.002
        if j==6:x+=.001;width+=.002
        cube('Lid full length plank',(x,0,1.25),(width,.12,2.5),'wood',.006,2)
    for x in [-.8,.8]:cube('Original amber lid band',(x,.07,1.25),(.12,.03,2.5),'amber',.005,2)
    # Rear axis lies at z=0. Shared barrels are split between stationary and moving halves.
    for x in [-.93,.93]:
        cube('Lid hinge leaf',(x,-.038,.105),(.25,.028,.21),'metal',.003)
        hinge_sleeve(x)
        for dx in [-.075,.075]:rod('Hinge leaf screw',(x+dx,-.053,.14),(x+dx,-.048,.14),.016,'metal',6)
def parent_parts(c,name):
    root=bpy.data.objects.new(name,None);c.objects.link(root)
    for o in list(c.objects):
        if o!=root:o.parent=root
    root['contract']='Three Y-up metres; identity group; runtime owns placement and hinge'
    return root
def baseline(data):
    global C
    C=collection('BASELINE | frozen production builders');roots=[]
    for name,info in data['meshes'].items():
        vs=np.array(info['positions']).reshape(-1,3);idx=np.array(info['indices']).reshape(-1,3)
        o=mesh('Actual baseline '+name,vs,idx.tolist(),M['wood']);cols=np.array(info['colorsLinear']).reshape(-1,3)
        for poly in o.data.polygons:poly.use_smooth=True
        o.data.normals_split_custom_set_from_vertices([p(n) for n in np.array(info['normals']).reshape(-1,3)])
        attr=o.data.color_attributes.new(name='ProductionColor',type='FLOAT_COLOR',domain='POINT')
        rgba=np.ones((len(cols),4),np.float32);rgba[:,:3]=cols;attr.data.foreach_set('color',rgba.ravel())
        m=material('Actual baseline response '+name,(1,1,1),.8);o.data.materials.clear();o.data.materials.append(m)
        node=m.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='ProductionColor';q=m.node_tree.nodes.get('Principled BSDF')
        m.node_tree.links.new(node.outputs['Color'],q.inputs['Base Color'])
        # Preserve per-vertex actual roughness and metallic through interpolated corner color attributes.
        am=np.array(info['aMat']).reshape(-1,4)
        for channel,inputname in [(0,'Roughness'),(1,'Metallic')]:
            ca=o.data.color_attributes.new(name=inputname,type='FLOAT_COLOR',domain='POINT');a=np.ones((len(am),4),np.float32);a[:,:3]=am[:,channel,None];ca.data.foreach_set('color',a.ravel())
            n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name=inputname;m.node_tree.links.new(n.outputs['Color'],q.inputs[inputname])
        if name=='Lid':o.location=p(PIVOT)
        roots.append(o)
    return C,roots
def rig():
    global C
    C=collection('RIG | controlled review only');scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.render.threads_mode='FIXED';scene.render.threads=3
    scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Neutral inspection world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.46,.52,.60,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
    floor=material('Rig ground',(.19,.215,.23),.92);cube('Rig contact ground',(0,-1.025,0),(200,.03,200),'rubber',0).data.materials[0]=floor
    for name,loc,power,size,color in [('Key',(-3,6,4),950,5,(1,.92,.80)),('Fill',(4,4,-2),650,4,(.75,.85,1)),('Rim',(-2,3,-4),700,3,(1,.94,.83))]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(name,d);C.objects.link(o);o.location=p(loc);o.rotation_euler=(p((0,.3,0))-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('Matched camera');o=bpy.data.objects.new('Matched camera',d);C.objects.link(o);scene.camera=o
    camera()
def camera(close=False,opened=False):
    o=bpy.context.scene.camera;o.location=p((4.8,3.3,5.6) if not close else (3.4,.25,3.9));target=(0,.25,0) if not close else (.8,-.26,.6)
    if opened:o.location=p((5.8,4.4,7));target=(0,1.2,0)
    o.rotation_euler=(p(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=5.5 if not close else 2.8
    if opened:o.data.ortho_scale=7.5
def render(name,samples=24):
    s=bpy.context.scene;s.cycles.samples=samples;s.render.filepath=str(OUT/name);s.render.image_settings.file_format='PNG';bpy.ops.render.render(write_still=True)
def night(enabled):
    s=bpy.context.scene;s.world.node_tree.nodes['Background'].inputs[1].default_value=.1 if enabled else .55
    for o in s.objects:
        if o.type=='LIGHT':
            if 'day_energy' not in o:o['day_energy']=o.data.energy
            o.data.energy=o['day_energy']*(.16 if enabled else 1)
def stats(objects):
    bpy.context.view_layer.update()
    lo=Vector((math.inf,)*3);hi=Vector((-math.inf,)*3);tris=0;bad=0;nonfinite=0;mats=set()
    for o in objects:
        if o.type!='MESH':continue
        o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
        for v in o.data.vertices:
            w=o.matrix_world@v.co;nonfinite+=not all(math.isfinite(x) for x in w)
            for i in range(3):lo[i]=min(lo[i],w[i]);hi[i]=max(hi[i],w[i])
        for t in o.data.loop_triangles:bad+=t.area<1e-12
        mats.update(m.name for m in o.data.materials)
    return dict(triangles=tris,materials=sorted(mats),bounds_three=dict(min=[lo.x,lo.z,-hi.y],max=[hi.x,hi.z,-lo.y]),nonfinite_vertices=nonfinite,degenerate_triangles=bad)
def preview():
    global C
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0;materials()
    data=json.loads((OUT/'baseline-captured.json').read_text());base,_=baseline(data)
    C=collection('ASSET | editable Shell construction');shell();sh=parent_parts(C,'Shell');shellcol=C
    C=collection('ASSET | editable Lid construction');lid();li=parent_parts(C,'Lid');lidcol=C
    li.location=p(PIVOT);rig();visible(shellcol,False);visible(lidcol,False)
    render('crate-before.png');night(True);render('crate-before-night.png');night(False)
    visible(base,False);visible(shellcol,True);visible(lidcol,True);render('crate-after.png')
    night(True);render('crate-after-night.png');night(False)
    bpy.context.view_layer.material_override=material('Rig neutral clay',(.55,.55,.52),.76);render('crate-clay.png');bpy.context.view_layer.material_override=None
    camera(True);render('crate-close.png');camera()
    camera(opened=True);li.rotation_euler.x=-2;render('crate-open-native.png');li.rotation_euler.x=0;camera()
    li.location=(0,0,0);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'crate-editable.blend'))
    info=dict(source_commit='34754d2',source_hashes=data['sourceHashes'],units='metres',native_axes='Z-up',runtime_axes='Y-up; front +Z',
      baseline={n:dict(bounds=m['bounds'],triangles=m['triangles']) for n,m in data['meshes'].items()},
      native={n:stats(list(c.objects)) for n,c in [('Shell',shellcol),('Lid',lidcol)]},
      rig=dict(camera_three=[4.8,3.3,5.6],target_three=[0,.25,0],ortho_scale=5.5,resolution=[1000,800],samples=24,view_transform='AgX',look='Medium High Contrast',exposure=0),
      textures=json.loads((TOOLS/'textures/sources.json').read_text()),
      references=['visual-calibration-20261027/ibd-yard-v1.png','visual-calibration-20261027/ibd-yard-night-v1.png'],
      limitations=['Offline matched geometry renders only; browser behavior and user visual acceptance pending.'])
    (OUT/'preview-validation.json').write_text(json.dumps(info,indent=2));print('PREVIEW_OK',json.dumps(info['native']))
def runtime_group(c,name):
    objects=[o for o in c.objects if o.type=='MESH'];root=next(o for o in c.objects if o.type=='EMPTY')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name+' | batched materials';select(o)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Native connected meshes are unwrapped before glTF splits UV/normal seams.
    return root,o
def bake_ao(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True);uv=o.data.uv_layers.new(name='UV1_AO');o.data.uv_layers.active=uv
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=0)
    bpy.ops.uv.pack_islands(rotate=True,margin_method='FRACTION',margin=3/1024)
    bpy.ops.object.mode_set(mode='OBJECT')
    im=bpy.data.images.new('Crate shared short range geometry AO',width=1024,height=1024,alpha=False);im.colorspace_settings.name='Non-Color'
    state=[]
    for mat in {m for o in objects for m in o.data.materials}:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');original=output.inputs['Surface'].links[0].from_socket
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.055;ao.only_local=True;ao.samples=16
        emission=nodes.new('ShaderNodeEmission');links.new(ao.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
        target=nodes.new('ShaderNodeTexImage');target.image=im;nodes.active=target;state.append((mat,output,original,ao,emission,target))
    # A joined bake-only proxy avoids image clearing across multiple source objects.
    bpy.ops.object.select_all(action='DESELECT');proxies=[]
    for source in objects:
        cp=source.copy();cp.data=source.data.copy();bpy.context.scene.collection.objects.link(cp)
        cp.parent=None;cp.matrix_world=source.matrix_world;cp.select_set(True);proxies.append(cp)
    bpy.context.view_layer.objects.active=proxies[0];bpy.ops.object.join();proxy=bpy.context.object
    scene=bpy.context.scene;scene.cycles.samples=64;scene.render.bake.margin=3;bpy.ops.object.bake(type='EMIT',use_clear=True)
    bpy.data.objects.remove(proxy,do_unlink=True)
    im.filepath_raw=str(OUT/'crate-ao-uv1.png');im.file_format='PNG';im.save();im.pack()
    group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    if not group.interface.items_tree:group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for mat,output,original,ao,emission,target in state:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;links.new(original,output.inputs['Surface']);nodes.remove(ao);nodes.remove(emission)
        uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='UV1_AO';links.new(uvnode.outputs['UV'],target.inputs['Vector'])
        if not mat.name.startswith('IBD | charcoal rubber'):
            g=nodes.new('ShaderNodeGroup');g.node_tree=group;links.new(target.outputs['Color'],g.inputs['Occlusion'])
    for o in objects:o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
    for o in objects:o.data.calc_loop_triangles()
    area=sum(abs((o.data.uv_layers['UV1_AO'].data[t.loops[1]].uv-o.data.uv_layers['UV1_AO'].data[t.loops[0]].uv).cross(o.data.uv_layers['UV1_AO'].data[t.loops[2]].uv-o.data.uv_layers['UV1_AO'].data[t.loops[0]].uv))*.5 for o in objects for t in o.data.loop_triangles)
    pixels=np.empty(1024*1024*4,np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(1024,1024,4)[:,:,0];samples=[]
    for o in objects:
        if not o.name.startswith('Lid'):continue
        uv=o.data.uv_layers['UV1_AO']
        for t in o.data.loop_triangles:
            center=sum((o.data.vertices[i].co for i in t.vertices),Vector())/3
            if t.normal.z>.99 and abs(center.x)<.60 and .055<center.z<.065 and .35<-center.y<2.15:
                point=sum((uv.data[li].uv for li in t.loops),Vector((0,0)))/3
                samples.append(float(pixels[min(1023,int(point.y*1024)),min(1023,int(point.x*1024))]))
    exposed=dict(count=len(samples),mean=float(np.mean(samples)) if samples else None,std=float(np.std(samples)) if samples else None)
    assert len(samples)>2 and exposed['mean']>.94,exposed
    return dict(size=[1024,1024],distance_m=.055,scene_samples=64,node_samples=16,only_local=True,atlas_uv_area=area,uv_channel=1,exposed_lid_center=exposed,
      excluded_materials=['IBD | charcoal rubber'],exclusion_reason='Fresh AO-only review found a tiny tire UV edge fragment; rubber retains original PBR and runtime shadows. AO is limited to structural timber/metal/straps/label contacts.')
def finish():
    global C
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'crate-editable.blend'));bpy.context.preferences.filepaths.save_version=0
    # Finish is repeatable on the saved delivery file: rebuild runtime from editable parts.
    for col in list(bpy.data.collections):
        if col.name.startswith('RUNTIME'):
            for o in list(col.objects):bpy.data.objects.remove(o,do_unlink=True)
            bpy.data.collections.remove(col)
    for mat in bpy.data.materials:
        if not mat.name.startswith('IBD |') or not mat.use_nodes:continue
        for node in list(mat.node_tree.nodes):
            if node.type=='GROUP' and node.node_tree and node.node_tree.name=='glTF Material Output':mat.node_tree.nodes.remove(node)
    base=next(c for c in bpy.data.collections if c.name.startswith('BASELINE'))
    shellcol=next(c for c in bpy.data.collections if c.name.startswith('ASSET | editable Shell'))
    lidcol=next(c for c in bpy.data.collections if c.name.startswith('ASSET | editable Lid'))
    native_lid_root=next(o for o in lidcol.objects if o.type=='EMPTY');native_lid_root.location=(0,0,0);native_lid_root.rotation_euler=(0,0,0)
    bpy.context.view_layer.update()
    native={}
    for name,col in [('Shell',shellcol),('Lid',lidcol)]:
        runtime=collection('RUNTIME | '+name)
        for o in list(col.objects):
            cp=o.copy();cp.data=o.data.copy() if o.data else None;runtime.objects.link(cp)
        copies=list(runtime.objects);root=next(o for o in copies if o.type=='EMPTY');root.name=name+' temporary'
        for cp in copies:
            if cp!=root:cp.parent=root
        visible(col,False);native[name]=runtime_group(runtime,name)
    # Deconflict root names after hiding native collections. No exported container.
    for name,col in [('Shell',shellcol),('Lid',lidcol)]:next(o for o in col.objects if o.type=='EMPTY').name=name+' editable'
    for name,(root,o) in native.items():root.name=name
    objects=[pair[1] for pair in native.values()]
    # Bake closed geometry contact; glTF export resets lid pivot afterwards.
    native['Lid'][0].location=p(PIVOT);visible(base,False)
    ao=bake_ao(objects);native['Lid'][0].location=(0,0,0)
    for c in bpy.data.collections:
        if c.name.startswith('RIG'):visible(c,False)
    bpy.ops.object.select_all(action='DESELECT')
    for root,o in native.values():root.select_set(True);o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'crate.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    # Native file opens on the editable closed assembly. Export roots above remain identity.
    for c in bpy.data.collections:
        if c.name.startswith('RUNTIME'):visible(c,False)
        if c.name.startswith(('ASSET','RIG')):visible(c,True)
    next(o for o in lidcol.objects if o.type=='EMPTY').location=p(PIVOT)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'crate-editable.blend'))
    data=(OUT/'crate.glb').read_bytes();gltf=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    roots=[gltf['nodes'][i] for i in gltf['scenes'][gltf.get('scene',0)]['nodes']]
    assert {r['name'] for r in roots}=={'Shell','Lid'},roots
    assert all(r.get('translation',[0,0,0])==[0,0,0] and r.get('rotation',[0,0,0,1])==[0,0,0,1] and r.get('scale',[1,1,1])==[1,1,1] for r in roots),roots
    assert all(m.get('occlusionTexture',{}).get('texCoord')==1 for m in gltf['materials'] if not m['name'].startswith('IBD | charcoal rubber'))
    assert all('occlusionTexture' not in m for m in gltf['materials'] if m['name'].startswith('IBD | charcoal rubber'))
    assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in gltf['materials'])
    assert not any(x in gltf.get('extensionsUsed',[]) for x in ['KHR_draco_mesh_compression','KHR_materials_transmission','KHR_lights_punctual'])
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'crate.glb'))
    fresh={name:next(o for o in bpy.context.scene.objects if o.name==name) for name in ['Shell','Lid']}
    for root in fresh.values():root.rotation_mode='XYZ'
    fact={name:stats(list(o.children_recursive)) for name,o in fresh.items()}
    for name,s in fact.items():assert not s['nonfinite_vertices'] and not s['degenerate_triangles'],(name,s)
    # Restore tiny rig-only material map after read_factory_settings.
    M.clear();M['rubber']=material('Rig dummy',(.2,.2,.2),.9)
    fresh['Lid'].location=p(PIVOT);rig();render('crate-fresh-closed.png');camera(True);render('crate-fresh-close.png');camera()
    ao_image=bpy.data.images.load(str(OUT/'crate-ao-uv1.png'));ao_image.colorspace_settings.name='Non-Color';state=[]
    for mat in {m for root in fresh.values() for o in root.children_recursive if o.type=='MESH' for m in o.data.materials}:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');old=output.inputs['Surface'].links[0].from_socket
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map=next(o for root in fresh.values() for o in root.children_recursive if o.type=='MESH').data.uv_layers[1].name
        tex=nodes.new('ShaderNodeTexImage');tex.image=ao_image;em=nodes.new('ShaderNodeEmission');links.new(uv.outputs['UV'],tex.inputs['Vector'])
        if mat.name.startswith('IBD | charcoal rubber'):em.inputs['Color'].default_value=(1,1,1,1)
        else:links.new(tex.outputs['Color'],em.inputs['Color'])
        links.new(em.outputs[0],output.inputs['Surface']);state.append((mat,output,old,[uv,tex,em]))
    render('crate-ao-only-fresh.png')
    for mat,output,old,temp in state:
        mat.node_tree.links.new(old,output.inputs['Surface'])
        for n in temp:mat.node_tree.nodes.remove(n)
    camera(opened=True);fresh['Lid'].rotation_euler.x=-2;render('crate-fresh-open.png');fresh['Lid'].rotation_euler.x=0;camera()
    night(True);render('crate-fresh-night.png')
    info=json.loads((OUT/'preview-validation.json').read_text());info.update(blender=bpy.app.version_string,fresh=fact,ao=ao,glb_roots=roots,
      glb_materials=gltf['materials'],extensions=gltf.get('extensionsUsed',[]),glb_bytes=len(data),
      verified=['Actual frozen builder baseline captured.','Fresh GLB import, identity named Shell/Lid root groups, local lid hinge contract.','Finite nondegenerate geometry, normal uncompressed indexed glTF, shared PBR maps and UV1 short range AO.'],
      hashes={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in OUT.iterdir() if f.suffix in ['.glb','.blend','.png']})
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2));print('FINISH_OK',json.dumps(dict(fresh=fact,bytes=len(data))))
def diagnose():
    import bmesh
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'crate-editable.blend'));result=[]
    for c in bpy.data.collections:
        if not c.name.startswith('ASSET'):continue
        for o in c.objects:
            if o.type!='MESH':continue
            bm=bmesh.new();bm.from_mesh(o.data);volume=bm.calc_volume(signed=True)
            bad=sum(not e.is_manifold for e in bm.edges);bm.free()
            result.append(dict(name=o.name,volume=volume,nonmanifold_edges=bad,material=[m.name for m in o.data.materials],position_three=[o.location.x,o.location.z,-o.location.y]))
    (OUT/'native-volume-diagnosis.json').write_text(json.dumps(result,indent=2))
    print('DIAGNOSE',json.dumps(dict(objects=len(result),negative=[r for r in result if r['volume']<=0],nonmanifold=[r for r in result if r['nonmanifold_edges']])) )
    camera(True);bpy.context.view_layer.update();cam=bpy.context.scene.camera;rot=cam.matrix_world.to_3x3();direction=rot@Vector((0,0,-1));rays=[]
    for xx,yy in [(474,12),(474,245),(535,520),(526,677),(310,473),(945,580),(250,560)]:
        origin=cam.location+rot@Vector(((xx/1000-.5)*2.8,(.5-yy/800)*2.8*.8,0));hits=[]
        for c in bpy.data.collections:
            if not c.name.startswith('ASSET'):continue
            for o in c.objects:
                if o.type!='MESH':continue
                inv=o.matrix_world.inverted();hit,loc,normal,index=o.ray_cast(inv@origin,inv.to_3x3()@direction)
                if hit:
                    world=o.matrix_world@loc;hits.append(dict(name=o.name,distance=(world-origin).length,face=index,normal_world=list(normal),material=o.data.materials[o.data.polygons[index].material_index].name))
        rays.append(dict(pixel=[xx,yy],hits=sorted(hits,key=lambda r:r['distance'])[:6]))
    print('RAYS',json.dumps(rays))
def open_view():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'crate-editable.blend'))
    li=next(o for o in bpy.context.scene.objects if o.name=='Lid');li.location=p(PIVOT);li.rotation_euler.x=-2
    camera(opened=True);render('crate-open-native.png')
if __name__=='__main__':
    phase=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
    if phase=='finish':finish()
    elif phase=='diagnose':diagnose()
    elif phase=='open':open_view()
    else:preview()
