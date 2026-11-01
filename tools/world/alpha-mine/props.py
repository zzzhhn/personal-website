"""Hand-authored procedural quarry tools. Blender 4+, no external dependencies.
Run: Blender --background --factory-startup --threads 2 --python props.py
Author coordinates below are metres, +Y up, +X working direction, +Z right.
Native sockets have asset prefixes to avoid Blender global-name collisions;
each independently exported GLB has the exact unprefixed socket names.
"""
import bpy, bmesh, math, random, json, struct, hashlib
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'public/world/alpha-mine'
EVIDENCE = HERE / 'props-evidence'
SOURCE = HERE / 'props.blend'
TAU = math.tau

def v(p): return Vector((p[0], -p[2], p[1]))
def yup(p): return [p[0], p[2], -p[1]]
def color(h):
    rgb = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)

def mat(name, hexcode, roughness, metal=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = color(hexcode)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metal
    m.diffuse_color = color(hexcode)
    return m

def materials():
    return {k: mat(k, *args) for k, args in {
        'waxed_ash': ('#976239', .57, 0), 'ash_light': ('#BA8753', .59, 0),
        'ash_grain': ('#745036', .67, 0), 'aged_brass': ('#A38046', .38, .72),
        'brass_edge': ('#C9AA6C', .32, .72), 'forged_iron': ('#3F494A', .58, .75),
        'steel_worn': ('#909993', .39, .78), 'grip_leather': ('#443A2C', .87, 0),
        'dial_ivory': ('#D7CBA8', .72, 0), 'dial_ink': ('#243E3C', .65, .05),
        'signal_copper': ('#9C5D3C', .47, .64), 'ore_stone': ('#84745E', .94, 0),
        'ore_stone_light': ('#A39477', .91, 0), 'ore_stone_dark': ('#665F52', .96, 0),
        'ore_mineral': ('#5C9B91', .47, .28), 'quartz': ('#D3CCAD', .64, .04),
    }.items()}

M = {}
ROOT = None

def mesh(name, verts, faces, material, indices=None):
    me = bpy.data.meshes.new(name); me.from_pydata([v(p) for p in verts], [], faces); me.update()
    mats = material if isinstance(material, list) else [material]
    for m in mats: me.materials.append(M[m])
    if indices:
        for p, i in zip(me.polygons, indices): p.material_index = i
    # Recalculate closed component winding, without welding intentionally separate parts.
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(ROOT.name + '_' + name, me)
    bpy.context.scene.collection.objects.link(ob); ob.parent = ROOT
    return ob

def tube(name, points, radii, material, n=12):
    # Ring planes perpendicular to the local centreline; closed ends are real caps.
    verts = []
    for i, p in enumerate(points):
        p = Vector(p); tangent = Vector(points[min(i+1, len(points)-1)]) - Vector(points[max(0, i-1)])
        tangent.normalize(); a = tangent.cross(Vector((0,0,1)))
        if a.length < .01: a = tangent.cross(Vector((0,1,0)))
        a.normalize(); b = tangent.cross(a).normalized()
        rr = radii[i] if isinstance(radii, list) else radii
        for j in range(n): verts.append(tuple(p + rr * (math.cos(j*TAU/n)*a + math.sin(j*TAU/n)*b)))
    faces = [tuple(reversed(range(n)))]
    for i in range(len(points)-1):
        for j in range(n): faces.append((i*n+j, i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j))
    faces.append(tuple((len(points)-1)*n+j for j in range(n)))
    return mesh(name, verts, faces, material)

def box(name, centre, size, material, bevel=0):
    c = Vector(centre); x,y,z = (s/2 for s in size)
    verts = [tuple(c+Vector(p)) for p in [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]]
    ob = mesh(name, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], material)
    if bevel:
        bpy.context.view_layer.objects.active=ob; ob.select_set(True)
        mod=ob.modifiers.new('Rounded cast edges','BEVEL'); mod.width=min(bevel,min(size)*.24); mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name); ob.select_set(False)
    return ob

def ring(name, centre, radius, thickness, axis, material, n=32, sides=8):
    normal = Vector(axis).normalized(); a = normal.cross(Vector((0,1,0)))
    if a.length < .01: a = normal.cross(Vector((0,0,1)))
    a.normalize(); b = normal.cross(a); c=Vector(centre); verts=[]; faces=[]
    for i in range(n):
        radial=math.cos(i*TAU/n)*a+math.sin(i*TAU/n)*b
        for j in range(sides): verts.append(tuple(c+(radius+thickness*math.cos(j*TAU/sides))*radial+thickness*math.sin(j*TAU/sides)*normal))
    for i in range(n):
        for j in range(sides): faces.append((i*sides+j,((i+1)%n)*sides+j,((i+1)%n)*sides+(j+1)%sides,i*sides+(j+1)%sides))
    return mesh(name,verts,faces,material)

def socket(name, p):
    ob=bpy.data.objects.new(ROOT.name+'_'+name,None); bpy.context.scene.collection.objects.link(ob)
    ob.parent=ROOT; ob.location=v(p); ob.empty_display_size=.025; ob['socketId']=name

def asset(name):
    global ROOT
    scene=bpy.data.scenes.new(name+'_Editable'); bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
    ROOT=bpy.data.objects.new(name,None); scene.collection.objects.link(ROOT)
    ROOT['units']='metres'; ROOT['runtimeAxes']='+Y up / +X working direction / +Z right'
    return ROOT

def pickaxe():
    root=asset('pickaxe')
    ys=[-.235,-.21,-.12,0,.17,.34,.49,.58,.635]
    pts=[(-.012*math.sin((y+.235)/.87*math.pi),y,0) for y in ys]
    shaft=tube('ash_handle',pts,[.022,.025,.022,.0205,.020,.021,.024,.026,.024],['waxed_ash','ash_light','ash_grain'])
    for p in shaft.data.polygons: p.material_index=1 if p.index%12 in [1,2,5] else 2 if p.index%12==8 else 0
    tube('butt_ferrule',[(0,-.239,0),(0,-.217,0)],.024,'aged_brass')
    tube('lower_grip',[(-.008,-.068,0),(-.01,.064,0)],.023,'grip_leather')
    for i in range(9):
        y=-.063+i*.015
        ring('wrap_%02d'%i,(-.009,y,0),.023,.0017,(0,1,0),'ash_grain',16,4)
    for y in [-.07,.066]: tube('grip_cap',[(0,y-.004,0),(0,y+.004,0)],.024,'aged_brass')
    # Forged continuous curved pick/adze. Elliptic sections join through the eye.
    sections=[(-.245,.600,.011,.045),(-.215,.608,.021,.041),(-.10,.607,.034,.032),
              (0,.593,.047,.037),(.10,.585,.032,.029),(.22,.555,.017,.017),(.29,.530,.007,.008),(.32,.520,.0013,.0018)]
    verts=[]; n=8
    for x,y,hy,hz in sections:
        for j in range(n): verts.append((x,y+hy*math.cos(j*TAU/n),hz*math.sin(j*TAU/n)))
    faces=[tuple(reversed(range(n)))]; inds=[1]
    for i in range(len(sections)-1):
        for j in range(n):
            faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j)); inds.append(1 if i in [0,6] or j==0 else 0)
    faces.append(tuple((len(sections)-1)*n+j for j in range(n))); inds.append(1)
    mesh('forged_pick_and_adze',verts,faces,['forged_iron','steel_worn'],inds)
    tube('eye_band',[(-.006,.553,0),(-.006,.629,0)],.033,'forged_iron',12)
    tube('wood_eye_wedge',[(-.006,.633,-.011),(-.006,.633,.011)],.006,'ash_light',6)
    # Actual raised rivet heads on the eye cheek; they intersect their supporting band.
    for z in [-.034,.034]: tube('eye_rivet',[(-.006,.593,z*.85),(-.006,.593,z*1.04)],.007,'brass_edge',10)
    socket('grip_R',(0,0,0)); socket('grip_L',(0,.17,0)); socket('head_contact',(.32,.52,0))
    root['assembly']='continuous wood shaft enters fitted forged eye; fixed band/rivets; curved pick and rear adze are one metal mesh'
    return root

def detector():
    root=asset('detector')
    tube('wood_handle',[(0,-.105,0),(0,-.088,0),(0,.072,0),(0,.11,0)],[.023,.026,.024,.021],'waxed_ash')
    tube('hand_grip',[(0,-.069,0),(0,.057,0)],.027,'grip_leather',12)
    for y in [-.074,.061]: tube('grip_binding',[(0,y-.006,0),(0,y+.006,0)],.028,'aged_brass')
    box('finger_guard',(0,.084,0),(.11,.018,.063),'aged_brass',.007)
    box('instrument_housing',(.015,.166,0),(.13,.15,.09),'aged_brass',.012)
    box('rear_bakelite_plate',(.015,.164,-.048),(.101,.117,.009),'grip_leather',.008)
    # Brass dial faces +Z, with individual ticks and a pivoted needle, no texture.
    tube('dial_bezel',[(.006,.176,.041),(.006,.176,.056)],.052,'brass_edge',40)
    tube('dial_face',[(.006,.176,.0555),(.006,.176,.058)],.045,'dial_ivory',40)
    for i in range(13):
        angle=(-140+i*23)*math.pi/180
        a=(.006+math.sin(angle)*.035,.176+math.cos(angle)*.035,.059)
        b=(.006+math.sin(angle)*(.041 if i%3==0 else .039),.176+math.cos(angle)*(.041 if i%3==0 else .039),.059)
        tube('dial_tick_%02d'%i,[a,b],.0012,'dial_ink',5)
    tube('dial_needle',[(.006,.176,.061),(.024,.203,.061)],[.0024,.0008],'signal_copper',6)
    tube('dial_pivot',[(.006,.176,.059),(.006,.176,.064)],.0042,'aged_brass',12)
    for x,y in [(-.036,.118),(.066,.118),(-.036,.214),(.066,.214)]:
        tube('case_screw',[(x,y,.043),(x,y,.049)],.0035,'steel_worn',8)
    # Short neck joins the housing, carrying an open induction loop normal to +X.
    tube('sensor_neck',[(.065,.20,0),(.112,.218,0),(.175,.226,0),(.227,.235,0)],.014,'forged_iron')
    tube('neck_collar',[(.071,.202,0),(.093,.211,0)],.020,'aged_brass')
    ring('induction_loop',(.237,.235,0),.091,.012,(1,0,0),'forged_iron',40,8)
    ring('copper_winding',(.243,.235,0),.091,.0042,(1,0,0),'signal_copper',40,6)
    # Hub/arms are rigidly seated on ring inside, with space through each quadrant.
    for y,z in [(.235+.081,0),(.235-.081,0),(.235,.081),(.235,-.081)]:
        tube('sensor_spoke',[(.232,.235,0),(.237,y,z)],.0045,'aged_brass',8)
    tube('sensor_hub',[(.214,.235,0),(.252,.235,0)],.021,'aged_brass',16)
    tube('scan_lens',[(.251,.235,0),(.256,.235,0)],.014,'dial_ink',16)
    # Armoured cable follows the neck and embeds at both terminals.
    cable=[(.047,.129,-.047),(.085,.122,-.059),(.124,.148,-.050),(.149,.190,-.028),(.185,.222,-.018),(.223,.235,-.015)]
    tube('sensor_cable',cable,.004,'grip_leather',8)
    socket('grip_R',(0,0,0)); socket('scan_origin',(.258,.235,0))
    root['assembly']='single-hand grip seated below instrument; cast housing supports neck and open induction loop; dial is geometric'
    return root

def ore():
    root=asset('ore'); rng=random.Random(401); n=13
    # Uneven rings form one closed, chipped host with a mineral seam through it.
    levels=[(-.139,.026),(-.103,.105),(-.039,.143),(.008,.149),(.027,.142),(.082,.117),(.132,.048)]
    radial=[rng.uniform(.91,1.09) for _ in range(n)]; verts=[]
    for k,(y,r) in enumerate(levels):
        for j in range(n):
            a=j*TAU/n; wav=.012*math.sin(a*2+.4)+.008*math.cos(a*3)
            verts.append((math.cos(a)*r*radial[j]+.01*math.sin(k),y+wav,math.sin(a)*r*radial[j]*.97))
    faces=[tuple(reversed(range(n)))]; indices=[2]
    for k in range(len(levels)-1):
        for j in range(n):
            a=k*n+j; b=k*n+(j+1)%n; c=(k+1)*n+(j+1)%n; d=(k+1)*n+j
            faces.extend([(a,b,c),(a,c,d)])
            indices.extend([3,3] if k==2 else [4,4] if k==3 else [rng.randrange(3),rng.randrange(3)])
    faces.append(tuple((len(levels)-1)*n+j for j in range(n))); indices.append(1)
    rock=mesh('fractured_host_and_seam',verts,faces,['ore_stone','ore_stone_light','ore_stone_dark','ore_mineral','quartz'],indices)
    # Short prismatic crystal terminations share the same re-tintable mineral material.
    for i,a in enumerate([.20,1.07,2.43,3.68,4.85,5.49]):
        d=Vector((math.cos(a),.27,math.sin(a))).normalized(); base=Vector((math.cos(a)*.122,-.009,math.sin(a)*.122))
        tube('embedded_mineral_%d'%i,[tuple(base),tuple(base+d*.019),tuple(base+d*.029)],[.013,.014,.003],'ore_mineral',5)
    # Bounding centre is the origin and release point, independent of random chips.
    pts=[ob.matrix_local @ vert.co for ob in root.children if ob.type=='MESH' for vert in ob.data.vertices]
    centre=Vector(tuple((min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)))
    for ob in root.children:
        if ob.type=='MESH':
            for vert in ob.data.vertices: vert.co-=centre
    socket('grip_R',(0,0,.15)); socket('grip_L',(0,0,-.15)); socket('release',(0,0,0))
    root['assembly']='closed irregular rock host with jagged mineral and quartz strata; small crystal roots embedded in the host'
    return root

def material_state(m):
    bs=m.node_tree.nodes.get('Principled BSDF')
    return {key:list(bs.inputs[key].default_value) if key in ['Base Color','Emission Color'] else bs.inputs[key].default_value
            for key in ['Base Color','Roughness','Metallic','Alpha','IOR','Emission Color','Emission Strength'] if key in bs.inputs}

def inspect(root):
    pts=[]; tris=0; bad=[]; mats={}; sockets={}; meshes=0
    for ob in root.children_recursive:
        if ob.type=='EMPTY':
            name=ob.get('socketId',ob.name)
            local=root.matrix_world.inverted() @ ob.matrix_world
            sockets[name]={'positionYUp':yup(local.translation),'matrixBlender':[list(row) for row in local]}
        if ob.type!='MESH': continue
        meshes+=1; me=ob.data; me.calc_loop_triangles(); tris+=len(me.loop_triangles)
        local=root.matrix_world.inverted() @ ob.matrix_world
        pp=[local @ vert.co for vert in me.vertices]; pts.extend(pp)
        for t in me.loop_triangles:
            a,b,c=[pp[i] for i in t.vertices]
            if (b-a).cross(c-a).length/2<1e-12: bad.append(ob.name+':degenerate')
        cp=me.copy(); repair=cp.validate(verbose=False); bpy.data.meshes.remove(cp)
        if repair: bad.append(ob.name+':validate-would-repair')
        bm=bmesh.new(); bm.from_mesh(me)
        if any(e.is_manifold and not e.is_contiguous for e in bm.edges): bad.append(ob.name+':winding')
        bm.free()
        if not all(math.isfinite(x) for p in pp for x in p): bad.append(ob.name+':nonfinite')
        for m in me.materials: mats[m.name]=material_state(m)
    yy=[yup(p) for p in pts]
    lo=[min(p[i] for p in yy) for i in range(3)]; hi=[max(p[i] for p in yy) for i in range(3)]
    return {'triangles':tris,'meshCount':meshes,'boundsYUp':[lo,hi],
            'dimensionsYUp':[hi[i]-lo[i] for i in range(3)],'materials':mats,'sockets':sockets,'problems':bad}

def glb_json(path):
    data=path.read_bytes(); assert data[:4]==b'glTF'
    count,typ=struct.unpack_from('<II',data,12); assert typ==0x4E4F534A
    return json.loads(data[20:20+count])

def export(root,path):
    bpy.ops.object.select_all(action='DESELECT')
    parts=[ob for ob in root.children_recursive if ob.type=='MESH']
    # Native file keeps every editable part; runtime merges pieces into material primitives.
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
    bpy.context.object.name=root.name+'_surface'
    for ob in root.children_recursive:
        if ob.get('socketId'): ob.name=ob['socketId']
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root]+list(root.children_recursive): ob.select_set(True)
    options=dict(export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
                 export_normals=True,export_materials='EXPORT',export_texcoords=False,
                 export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
    available={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    assert not set(options)-available
    bpy.ops.export_scene.gltf(filepath=str(path),**options)

def render_board():
    bpy.ops.wm.read_factory_settings(use_empty=True); scene=bpy.context.scene
    positions={'detector':(-.58,0,.315),'pickaxe':(.015,0,.245),'ore':(.65,0,.35)}
    for name in positions:
        bpy.ops.import_scene.gltf(filepath=str(OUT/(name+'.glb')))
        root=bpy.data.objects[name]; root.location=positions[name]
    global ROOT
    ROOT=bpy.data.objects.new('PRESENTATION_ONLY',None); scene.collection.objects.link(ROOT)
    M['studio']=mat('studio_stone','#716B5E',.95)
    # A quiet neutral floor and two low display blocks expose the silhouettes at relative scale.
    box('floor',(0,-.034,0),(8,.06,8),'studio',.015)
    for x,w in [(-.48,.50),(.65,.42)]: box('plinth',(x,.105,0),(w,.21,.36),'studio',.014)
    world=bpy.data.worlds.new('Prop_studio');world.use_nodes=True;scene.world=world
    bg=world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.28,.34,.38,1);bg.inputs['Strength'].default_value=.6
    for name,p,energy,size,c in [('key',(-1.4,-1.8,2.6),190,2.2,(1,.85,.66)),
                               ('fill',(2,-1,1.7),95,2,(.68,.82,1)),('rim',(.1,1.2,2.2),180,1.7,(1,.91,.74))]:
        light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.shape='DISK';light.size=size;light.color=c
        ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=p
        ob.rotation_euler=(Vector((0,0,.42))-ob.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.cameras.new('Prop_board'); cam=bpy.data.objects.new('Prop_board',camera)
    scene.collection.objects.link(cam);scene.camera=cam;cam.location=(1.25,-2.8,1.6)
    cam.rotation_euler=(Vector((0,0,.43))-cam.location).to_track_quat('-Z','Y').to_euler()
    camera.type='ORTHO';camera.ortho_scale=1.82
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
    scene.render.resolution_x=900;scene.render.resolution_y=650;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(EVIDENCE/'props-board.png')
    bpy.ops.render.render(write_still=True)
    return {'image':'props-board.png','renderer':'CPU Cycles','samples':24,'resolution':[900,650],
            'colorManagement':{'view':'AgX','look':scene.view_settings.look,'exposure':0,'gamma':1},
            'scope':'actual reimported three exported GLBs at metre-relative scale; studio plinths, lights, camera not exported'}

def run():
    global M
    EVIDENCE.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True); M=materials()
    roots=[detector(),pickaxe(),ore()]; native={}
    for root in roots:
        bpy.context.window.scene=bpy.data.scenes[root.name+'_Editable'];bpy.context.view_layer.update()
        native[root.name]=inspect(root); assert not native[root.name]['problems'],native[root.name]['problems']
    bpy.context.window.scene=bpy.data.scenes['detector_Editable']
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
    result={'schema':'alpha-mine-props-qa-v1','blender':bpy.app.version_string,
            'source':'tools/world/alpha-mine/props.blend','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'axes':'metres; +Y up, +X working direction, +Z right; socket rotations identity','assets':{}}
    for name in ['detector','pickaxe','ore']:
        # Save -> reopen source -> independent export -> brand-new empty scene import.
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.window.scene=bpy.data.scenes[name+'_Editable']
        bpy.context.view_layer.update(); reopened=inspect(bpy.data.objects[name])
        assert reopened==native[name],name+':source reopen mismatch'
        path=OUT/(name+'.glb');export(bpy.data.objects[name],path)
        serialized=glb_json(path); scene_nodes=serialized['scenes'][serialized.get('scene',0)]['nodes']
        assert len(scene_nodes)==1 and serialized['nodes'][scene_nodes[0]]['name']==name
        nodes={node['name']:node for node in serialized['nodes']}
        for socket_name,expected in native[name]['sockets'].items():
            node=nodes[socket_name]
            actual=node.get('translation',[0,0,0]);assert max(abs(a-b) for a,b in zip(actual,expected['positionYUp']))<1e-6
            assert max(abs(a-b) for a,b in zip(node.get('rotation',[0,0,0,1]),[0,0,0,1]))<1e-6
            assert node.get('scale',[1,1,1])==[1,1,1]
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
        imported=inspect(bpy.data.objects[name]);assert not imported['problems'],imported['problems']
        delta=max(abs(a-b) for aa,bb in zip(native[name]['boundsYUp'],imported['boundsYUp']) for a,b in zip(aa,bb))
        assert delta<1e-6 and native[name]['triangles']==imported['triangles']
        assert set(imported['materials'])==set(native[name]['materials'])
        for material,fields in native[name]['materials'].items():
            for key,expected in fields.items():
                got=imported['materials'][material][key]
                assert max(abs(a-b) for a,b in zip(expected,got))<1e-6 if isinstance(expected,list) else abs(expected-got)<1e-6
        assert set(imported['sockets'])==set(native[name]['sockets'])
        result['assets'][name]={'file':'public/world/alpha-mine/'+name+'.glb','bytes':path.stat().st_size,
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':native[name],'freshGLB':imported,
            'maxBoundsDeltaM':delta,'serializedMaterials':serialized['materials'],
            'serializedSocketNodes':{key:nodes[key] for key in native[name]['sockets']},
            'serializedRootNode':nodes[name]}
        print('PROP_PASS',name,imported['dimensionsYUp'],imported['triangles'],len(imported['materials']),path.stat().st_size,flush=True)
    pick=result['assets']['pickaxe']['freshGLB']['sockets']
    dist=Vector(pick['head_contact']['positionYUp']).length
    assert .55<=dist<=.65 and .14<=pick['grip_L']['positionYUp'][1]-pick['grip_R']['positionYUp'][1]<=.20
    result['pickaxeContactDistanceM']=dist
    result['limits']=['Rigid authored props; no G24 IK or browser claim.','Wood grain and metal wear use facet colour/material variation, no image textures.',
        'Deliberate fitted component intersections at collars, rivets, sensor spokes and mineral roots; not a Boolean union or mechanical simulation.',
        'Native source prefixes socket names only because Blender globally deduplicates object names; independent GLBs contain exact contract names.']
    result['render']=render_board()
    (EVIDENCE/'props-qa.json').write_text(json.dumps(result,indent=2)+'\n')
    (EVIDENCE/'README.md').write_text('Three quarry props, exported and independently reimported.\n\n'
        'Rebuild using the installed Blender in background mode, --threads 2 --python tools/world/alpha-mine/props.py. '
        'Run the workspace resource preflight and acquire /tmp/bobby-world-phase2-heavy.lock before rebuilding. '
        'The native file retains separate named editable components in one scene per prop. '
        'Runtime merges each prop into one multi-material mesh plus exact named sockets. '
        'props-qa.json binds the source, GLBs, serialized materials, bounds and sockets to SHA-256 hashes. '
        'props-board.png is rendered from the actual GLBs at relative metre scale; it is internal visual evidence, not user approval or G24 acceptance.\n')
    print('PROPS_COMPLETE',flush=True)

if __name__=='__main__':run()
