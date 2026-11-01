"""Distinct factor ore silhouettes, preserving the original default ore root.
Blender background only, serialised under the shared heavy-job lock.
"""
import bpy, math, json, hashlib, sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import props as p
OUT=p.OUT;EVIDENCE=HERE/'props-evidence'

def sockets(root):
    p.socket('grip_R',(0,0,.15));p.socket('grip_L',(0,0,-.15));p.socket('release',(0,0,0))
    root['factorOre']=root.name.removeprefix('ore_')
    return root

def reversal():
    root=p.asset('ore_reversal')
    # Two mineral crescents curve around a compact contact core.
    p.tube('compact_host',[(0,-.095,0),(0,-.055,0),(0,.04,0),(0,.085,0)],
           [.04,.09,.08,.035],'ore_stone',9)
    for i,offset in enumerate([0,math.pi]):
        angles=[offset-.45+k*math.pi*.93/8 for k in range(9)]
        points=[(.105*math.cos(a),.018+.067*math.sin(a),.058*math.sin(a)) for a in angles]
        p.tube('reversal_crescent_'+str(i),points,[.012,.027,.034,.036,.037,.034,.028,.018,.004],'ore_mineral',6)
    for i in range(5):
        a=i*math.tau/5
        base=(.055*math.cos(a),-.015,.055*math.sin(a))
        p.tube('quartz_contact_'+str(i),[base,(base[0]*1.65,.028,base[2]*1.65)], [.024,.007],'quartz',5)
    return sockets(root)

def momentum():
    root=p.asset('ore_momentum')
    p.tube('directional_host',[(-.11,-.055,0),(-.055,-.035,0),(.06,.005,0)], [.035,.080,.045],'ore_stone',8)
    # Long, aligned, pointed shards provide an unmistakable directional silhouette.
    for i in range(5):
        z=(i-2)*.028;y=-.02+(i%2)*.025;start=-.09+.012*i
        p.tube('momentum_crystal_'+str(i),[(start,y,z),(.03,y+.055,z),(.14-.015*abs(i-2),y+.115,z)],
               [.025,.032,.0015],'ore_mineral',5)
    return sockets(root)

def lowvol():
    root=p.asset('ore_lowvol');n=9
    # Low, dense, offset plates have a calm broad silhouette and visible fine seams.
    for k in range(5):
        cy=-.082+k*.036;radius=.129*(1-.10*abs(k-2));verts=[]
        for y,r in [(cy-.016,radius*.88),(cy+.014,radius)]:
            for j in range(n):
                a=j*math.tau/n;rr=r*(1+.07*math.sin(j*2.7+k))
                verts.append((rr*math.cos(a)+.008*math.sin(k),y,rr*.78*math.sin(a)))
        faces=[tuple(reversed(range(n))),tuple(n+j for j in range(n))]
        for j in range(n):faces.append((j,(j+1)%n,n+(j+1)%n,n+j))
        p.mesh('dense_plate_'+str(k),verts,faces,['ore_stone','ore_stone_light','ore_mineral'],[k%2,k%2]+[2 if k==2 else k%2]*n)
    return sockets(root)

def run():
    bpy.ops.wm.read_factory_settings(use_empty=True);p.M=p.materials();roots=[p.ore(),reversal(),momentum(),lowvol()]
    native={}
    for root in roots:
        bpy.context.window.scene=bpy.data.scenes[root.name+'_Editable'];bpy.context.view_layer.update()
        native[root.name]=p.inspect(root);assert not native[root.name]['problems']
    source=HERE/'ore-variants.blend';bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    target=bpy.data.scenes.new('Ore_variants_export');bpy.context.window.scene=target
    for name in native:
        root=bpy.data.objects[name]
        for ob in [root]+list(root.children_recursive):
            target.collection.objects.link(ob)
            for collection in list(ob.users_collection):
                if collection!=target.collection:collection.objects.unlink(ob)
        bpy.context.view_layer.update();reopened=p.inspect(root)
        assert reopened==native[name],name+':source reopen mismatch'
        bpy.ops.object.select_all(action='DESELECT');parts=[o for o in root.children_recursive if o.type=='MESH']
        for ob in parts:ob.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=name+'_surface'
        if name=='ore':
            for ob in root.children_recursive:
                if ob.get('socketId'):ob.name=ob['socketId']
    bpy.ops.object.select_all(action='DESELECT')
    for name in native:
        root=bpy.data.objects[name]
        for ob in [root]+list(root.children_recursive):ob.select_set(True)
    path=OUT/'ore.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,
        export_yup=True,export_normals=True,export_materials='EXPORT',export_texcoords=False,
        export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
    gltf=p.glb_json(path);nodes={node['name']:node for node in gltf['nodes']}
    assert {gltf['nodes'][i]['name'] for i in gltf['scenes'][gltf.get('scene',0)]['nodes']}==set(native)
    for name in native:
        for s in ['grip_R','grip_L','release']:assert (s if name=='ore' else name+'_'+s) in nodes
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    fresh={};deltas={}
    for name,expected in native.items():
        got=p.inspect(bpy.data.objects[name]);fresh[name]=got;assert not got['problems']
        delta=max(abs(a-b) for aa,bb in zip(expected['boundsYUp'],got['boundsYUp']) for a,b in zip(aa,bb));deltas[name]=delta
        assert delta<1e-6 and expected['triangles']==got['triangles']
        assert expected['sockets']==got['sockets'],name+':socket change'
        assert set(expected['materials'])==set(got['materials'])
        for mat,fields in expected['materials'].items():
            for key,value in fields.items():
                actual=got['materials'][mat][key]
                assert max(abs(a-b) for a,b in zip(value,actual))<1e-6 if isinstance(value,list) else abs(value-actual)<1e-6
    layout=json.loads((OUT/'layout.json').read_text());ore=layout['dynamicAssets']['ore']
    ore['sharedGeometry']=False;ore['variants']={'vein-lower':'ore_reversal','vein-middle':'ore_momentum','vein-upper':'ore_lowvol'}
    ore['variantSockets']={name:{s:name+'_'+s for s in ['grip_R','grip_L','release']} for name in native if name!='ore'}
    (OUT/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    report={'source':str(source.relative_to(HERE.parents[2])),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'bytes':path.stat().st_size,'native':native,'freshGLB':fresh,'maxBoundsDeltaM':deltas,'defaultRoot':'ore',
        'limits':'Static shape and exact fresh-import sockets verified; grip animation and factor selection are integration-owned.'}
    (EVIDENCE/'ore-variants-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    print('ORE_VARIANTS_PASS',json.dumps({n:g['triangles'] for n,g in fresh.items()}),path.stat().st_size,flush=True)

if __name__=='__main__':run()
