"""Three closed, embedded mineral patches, each with three explicit damage states.
Build with the existing Blender, under the shared heavy-job lock.
All authored positions are facility-local glTF metres, converted exactly once.
"""
import sys, math, json, hashlib
from pathlib import Path
import bpy, bmesh
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from layout import OUT, VEINS, ore_rest
from build import v3, linear

GLB=OUT/'veins.glb';SOURCE=HERE/'veins.blend';EVIDENCE=HERE/'evidence'
TINTS=['#b7864d','#5c9b91','#9ba8b1']

def patch(state):
    """One watertight shell: fractures change real depth, without decal overlays."""
    nx,ny=10,12;vertices=[];faces=[];roles=[]
    def front(x,y):
        fissure=x-.23*math.sin(y*5)-.12*y
        z=.22+.035*math.cos(x*4+y*3)
        if state=='cracked':z-=.095*math.exp(-(fissure/.075)**2)
        if state=='open':
            r=math.hypot(x/.46,y/.53)
            z-=.205*max(0,1-r*r)**.55
        return z
    for j in range(ny+1):
        y=-.79+j/ny*1.58
        for i in range(nx+1):
            u=-1+2*i/nx
            width=.72+.07*math.sin(y*6+.4)+.035*math.sin(y*13)
            x=u*width
            yy=y+.025*math.sin(i*1.8+j*.7)*(1 if j in [0,ny] else .4)
            vertices.append((x,yy,front(x,yy)))
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+2;d=a+nx+1
            for tri in ([(a,b,d),(b,c,d)] if (i+j)%2 else [(a,b,c),(a,c,d)]):
                p=[vertices[k] for k in tri];x=sum(t[0] for t in p)/3;y=sum(t[1] for t in p)/3
                band=abs(x-.23*math.sin(y*5)-.12*y)
                mineral=band<(.105+.04*math.cos(y*7))
                if state=='open' and math.hypot(x/.46,y/.53)<.65:mineral=False
                faces.append(tri);roles.append(1 if mineral else 0)
    boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]
    boundary += [ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
    back=[]
    for k in boundary:
        x,y,z=vertices[k];back.append(len(vertices));vertices.append((x*.94,y*.94,-.20))
    center=len(vertices);vertices.append((0,0,-.20))
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

def create():
    stone=mat('AM_vein_host','#898575',.94);roots=[]
    for index,v in enumerate(VEINS):
        root=empty(v['id']);root['placement']=v['socket'];root['defaultState']='intact';root['units']='metres';roots.append(root)
        mineral=mat('AM_mineral_'+v['id'],TINTS[index],.48,.10)
        for state in ['intact','cracked','open']:
            group=empty(v['id']+'_'+state,root);group['damageState']=state
            vs,fs,roles=patch(state);me=bpy.data.meshes.new(v['id']+'_'+state+'_shell')
            me.from_pydata([v3(p) for p in vs],[],fs);me.update();me.materials.append(stone);me.materials.append(mineral)
            for p,role in zip(me.polygons,roles):p.material_index=role
            ob=bpy.data.objects.new(v['id']+'_'+state+'_rock',me);bpy.context.scene.collection.objects.link(ob);ob.parent=group
        # The hit marker lies on the unbroken exposed front at the centre.
        empty(v['id']+'_impact',root,(0,0,.255))
        rest=ore_rest(v);empty(v['id']+'_oreRest',root,[rest[i]-v['socket'][i] for i in range(3)])
    bpy.context.view_layer.update();return roots

def inspect():
    report=[]
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH':continue
        me=ob.data;me.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(me)
        row={'node':ob.name,'triangles':len(me.loop_triangles),'nonmanifold':sum(not e.is_manifold for e in bm.edges),
             'badWinding':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'volume':bm.calc_volume(signed=True),
             'degenerate':sum(t.area<1e-12 for t in me.loop_triangles),'scale':list(ob.scale)}
        bm.free();copy=me.copy();row['validateWouldRepair']=copy.validate();bpy.data.meshes.remove(copy)
        assert not any(row[k] for k in ['nonmanifold','badWinding','degenerate','validateWouldRepair']),row
        assert row['volume']>0,row
        report.append(row)
    sockets={}
    for v in VEINS:
        root=bpy.data.objects[v['id']];assert all(abs(s-1)<1e-6 for s in root.scale)
        assert root.location.length<1e-8
        for state in ['intact','cracked','open']:assert bpy.data.objects[v['id']+'_'+state].parent==root
        for kind in ['impact','oreRest']:
            ob=bpy.data.objects[v['id']+'_'+kind];p=ob.matrix_world.translation
            sockets[ob.name]=[p.x,p.z,-p.y]
    return {'meshes':report,'triangles':sum(r['triangles'] for r in report),'sockets':sockets}

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
    camera.location=v3((2.2,1,10));camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=8.4
    scene.render.filepath=str(EVIDENCE/'veins-states.png');bpy.ops.render.render(write_still=True)

def run():
    OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(exist_ok=True);bpy.ops.wm.read_factory_settings(use_empty=True)
    roots=create();native=inspect();bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',
        export_draco_mesh_compression_enable=True,export_draco_position_quantization=20,export_draco_normal_quantization=12)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));reopened=inspect()
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB))
    # GLB hard-normal seams are split on import. Weld a disposable diagnostic copy.
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':
            bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5);bm.to_mesh(ob.data);bm.free();ob.data.update()
    bpy.context.view_layer.update();fresh=inspect()
    assert native['triangles']==reopened['triangles']==fresh['triangles']
    for name,p in native['sockets'].items():assert math.dist(p,fresh['sockets'][name])<1e-5,(name,p,fresh['sockets'][name])
    report={'asset':'alpha-veins','bytes':GLB.stat().st_size,'sha256':hashlib.sha256(GLB.read_bytes()).hexdigest(),
            'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'native':native,'reopened':reopened,'freshGLB':fresh,
            'units':'metres','rootPlacement':'each vein root is local zero; place at layout.veins[].socket',
            'stateVisibility':'all states exported; runtime must show only intact initially, then cracked or open',
            'oreRestMeaning':'ore centre, not bottom; supported by static stone ledge',
            'scope':'geometry and socket exchange only; game light, pick contact, pickup and creative acceptance pending'}
    (EVIDENCE/'veins-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    print('AM_VEINS_PASS',report['bytes'],fresh['triangles'],flush=True);render()
    (EVIDENCE/'veins-render.json').write_text(json.dumps({'glbSha256':report['sha256'],'image':'veins-states.png','columns':['intact','cracked','open'],'rows':[v['id'] for v in VEINS],'previewOnly':'temporary row/column transforms and studio light'},indent=1)+'\n')

if __name__=='__main__':run()
