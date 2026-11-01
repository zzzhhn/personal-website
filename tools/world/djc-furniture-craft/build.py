"""Three actual remaining Club families. Native named parts; family/material GLB batches.
Meters, Blender Z up. No gameplay/collision geometry enters this export.
Uses the accepted umbrella's existing geometry/material/inspection helpers read-only.
"""
import bpy, math, json, hashlib, importlib.util
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
OUT=REPO/'docs/world/phase-2-playground/djc-furniture-craft-20261101'
spec=importlib.util.spec_from_file_location('accepted_craft',HERE.parent/'djc-umbrella-craft/build.py')
U=importlib.util.module_from_spec(spec);spec.loader.exec_module(U);U.OUT=OUT

def box(name,p,size,m,c,r=.003):
    o=U.put(U.craft_box(name,p,size,m,r),c)
    # Fabrication mapping per face. The photograph's long grain follows each
    # board's longest manufactured axis; no collapsed UVs on horizontal tops.
    layer=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap');longest=max(range(3),key=lambda i:size[i])
    offset=(sum(ord(k) for k in name)%37)/53
    for face in o.data.polygons:
        normal=max(range(3),key=lambda i:abs(face.normal[i]));plane=[i for i in range(3) if i!=normal]
        if longest in plane:axis_v=longest;axis_u=next(i for i in plane if i!=longest)
        else:axis_u,axis_v=plane
        for li in face.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co;layer.data[li].uv=(co[axis_u]/1.6+.17+offset,co[axis_v]/1.6+.23+offset)
    return o
def ring(name,r,z,m,c,center=(0,0),thickness=.004):
    return U.tube(name,[(center[0]+r*math.cos(i*math.tau/64),center[1]+r*math.sin(i*math.tau/64),z) for i in range(64)],thickness,m,c,True)
def rounded_outline(w,l,r,z):
    points=[]
    for x,y,a in [(w/2-r,l/2-r,0),(-w/2+r,l/2-r,math.pi/2),(-w/2+r,-l/2+r,math.pi),(w/2-r,-l/2+r,3*math.pi/2)]:
        for i in range(9):
            angle=a+i*math.pi/16;points.append((x+r*math.cos(angle),y+r*math.sin(angle),z))
    return points
def apply_parts(c):
    for o in list(c.objects):
        if o.type!='MESH':continue
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        for modifier in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
    bpy.context.view_layer.update()

def lounger(c,M):
    wood,metal,cloth=M['wood'],M['metal'],M['cloth']
    # A low platform frame, not taller legs: preserve the source's 16cm timber slab.
    for x in [-.55,.55]:box('Lounger | continuous rebated side rail',(x,0,.02),(.1,2.4,.16),wood,c,.009)
    for y in [-1.15,1.15]:box('Lounger | end rail fitted between sides',(0,y,.02),(1,.1,.16),wood,c,.008)
    for i in range(17):
        y=-1.075+i*.134
        box('Lounger | mattress-bearing slat %02d'%i,(0,y,.07),(1.02,.112,.07),wood,c,.004)
    # Visible scarf plates and restrained screw heads belong only at load-bearing corners.
    for x in [-.548,.548]:
        for y in [-1.075,1.075]:
            box('Lounger | recessed corner strap',(x,y,.102),(.064,.12,.004),metal,c,.001)
            for dy in [-.035,.035]:U.lathe('Lounger | strap pin',[(0,.104),(.008,.104),(.008,.107),(0,.107)],metal,c,12).location=(x,y+dy,0)
    # Tailored mattress crown keeps the original maximum y1.695 and real lower contact.
    levels=[(.105,.99),(.113,1),(.133,1),(.268,.992),(.286,.972),(.295,.94)]
    outlines=[rounded_outline(1.12*s,2.3*s,.065,z) for z,s in levels];n=len(outlines[0]);v=[p for row in outlines for p in row];f=[]
    f.append(tuple(reversed(range(n))));f.append(tuple((len(levels)-1)*n+i for i in range(n)))
    for j in range(len(levels)-1):
        for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    pad=U.mesh('Lounger | closed crowned tailored teal cushion',v,f,cloth,c,True)
    layer=pad.data.uv_layers.new(name='UVMap')
    for face in pad.data.polygons:
        normal=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=normal]
        for li in face.loop_indices:
            co=pad.data.vertices[pad.data.loops[li].vertex_index].co;layer.data[li].uv=(co[axes[0]]/.6+.17,co[axes[1]]/.6+.23)
    for z in [.124,.272]:U.tube('Lounger | continuous welt seam',rounded_outline(1.112,2.292,.065,z),.0038,M['binding'],c,True)
    # Four discrete seam tabs at the underside explain the fitted cover without surface clutter.
    for y in [-.9,.9]:
        for x in [-.5,.5]:box('Lounger | underside fastening tab',(x,y,.109),(.035,.1,.006),M['binding'],c,.001)
    # A double stitched join near the head is fabric construction, not additional padding.
    for x in [-.5+i*.025 for i in range(41)]:
        U.tube('Lounger | head seam lock stitch',[(x,.89,.294),(x+.009,.89,.294)],.0007,M['binding'],c,sides=4)

def console(c,M):
    wood,metal=M['wood'],M['metal']
    # Top matches old x32.12..33.48,z52.5..57.5,y2.76..2.92.
    for i in range(5):box('Console | full-depth top board %02d'%i,(-.544+i*.272,0,.84),(.269,5,.16),wood,c,.009)
    for y in [-2.27,2.27]:
        for x in [-.55,.5]:
            U.beam('Console | steel trestle leg',(x,y,.035),(x*.98,y,.72),.085,.085,metal,c,.004)
            box('Console | adjustable rubber foot',(x,y,.018),(.11,.11,.036),M['rubber'],c,.005)
        U.beam('Console | full-width upper bearing',(-.62,y,.72),(.57,y,.72),.085,.10,metal,c,.003)
        U.beam('Console | trestle lower brace',(-.55,y,.17),(.5,y,.17),.045,.045,metal,c,.002)
    for x in [-.55,.5]:U.beam('Console | longitudinal tie',(x,-2.27,.48),(x,2.27,.48),.045,.045,metal,c,.002)
    for y in [-1.55,0,1.55]:U.beam('Console | counter underside joist',(-.60,y,.73),(.59,y,.73),.075,.075,wood,c,.003)
    # Original rhythmic front battens remain in the same .08m projection envelope.
    for i in range(31):
        y=2.42-i*.16
        box('Console | eased vertical face batten %02d'%i,(.67,y,.46),(.08,.105,.72),wood,c,.009)
        for z in [.16,.76]:
            o=U.lathe('Console | plugged front rail join',[(0,.0),(.006,0),(.006,.003),(0,.003)],wood,c,12);o.rotation_euler[1]=math.pi/2;o.location=(.707,y,z)
    for z in [.15,.76]:U.beam('Console | continuous batten backing',(.616,-2.43,z),(.616,2.43,z),.045,.08,wood,c,.002)
    # A small real cable service saddle stays under the top, away from controller controls.
    for y in [-2.12,2.12]:
        U.tube('Console | underside cable saddle',[(x,y,.715-.04*math.sin(i*math.pi/8)) for i,x in enumerate([-.3+i*.055 for i in range(9)])],.008,metal,c)

def speaker(c,M):
    shell,metal,rubber=M['speaker'],M['metal'],M['rubber']
    # Five-sided cabinet with inset driver baffle. Front is world +X.
    for x in [-.422,.405]:box('Speaker | sealed rear and front baffle',(x,0,.9),(.056,.78,1.55),shell,c,.01)
    for y in [-.361,.361]:box('Speaker | cabinet sidewall',(0,y,.9),(.79,.058,1.55),shell,c,.008)
    for z in [.156,1.644]:box('Speaker | cabinet end cap',(0,0,z),(.79,.67,.062),shell,c,.007)
    # Keep exact two source woofer centers and upper tweeter, with distinct flexible surrounds.
    for z in [.59,1.17]:
        profile=[(.0,.441),(.035,.445),(.15,.459),(.205,.478),(.219,.472),(.229,.478),(.24,.475),(.24,.43),(.0,.43)]
        o=U.lathe('Speaker | closed woofer cone and surround',profile,rubber,c,64);o.rotation_euler[1]=math.pi/2;o.location=(0,0,z)
        for r,t in [(.246,.005),(.225,.004)]:
            o=ring('Speaker | concentric driver mounting rim',r,.483,metal,c,thickness=t);o.rotation_euler[1]=math.pi/2;o.location=(0,0,z)
        for i in range(6):
            a=i*math.tau/6;o=U.lathe('Speaker | captive driver fastener',[(0,.43),(.003,.43),(.003,.487),(.006,.487),(.006,.492),(0,.492)],metal,c,10);o.rotation_euler[1]=math.pi/2;o.location=(0,.259*math.sin(a),z+.259*math.cos(a))
    o=U.lathe('Speaker | recessed compression tweeter',[(0,.447),(.04,.447),(.075,.465),(.09,.475),(.09,.43),(0,.43)],metal,c,40);o.rotation_euler[1]=math.pi/2;o.location=(0,0,1.45)
    # A rigid sparse protective grille has real gaps, a frame and ordered mesh.
    for y in [-.345,.345]:U.beam('Speaker | protective grille side',( .493,y,.21),(.493,y,1.58),.01,.012,metal,c,.001)
    for z in [.21,1.58]:U.beam('Speaker | protective grille header',(.493,-.345,z),(.493,.345,z),.01,.012,metal,c,.001)
    for y in [-.345,.345]:
        for z in [.21,1.58]:U.beam('Speaker | grille mounting standoff',(.429,y,z),(.493,y,z),.012,.012,metal,c,.001)
    for j in range(23):
        y=-.33+j*.03;U.tube('Speaker | grille vertical wire',[(.493,y,.22),(.493,y,1.57)],.0015,metal,c,sides=6)
    for j in range(45):
        z=.225+j*.03;U.tube('Speaker | grille cross wire',[(.497,-.335,z),(.497,.335,z)],.0015,metal,c,sides=6)
    # Stand ends at the existing support bottom, with a bolted vibration shoe.
    U.lathe('Speaker | existing short support shoe',[(0,0),(.14,0),(.14,.155),(.11,.16),(0,.16)],metal,c,40)
    for y in [-.29,.29]:box('Speaker | rear recessed carrying grip',(-.448,y,.95),(.004,.11,.26),rubber,c,.001)

def native_stats(c):
    return U.stats([o for o in c.all_objects if o.type=='MESH'],True)
def check(family,s):
    assert s['nonfinite_vertices']==0 and s['degenerate_triangles']==0,s
    assert not s['nonmanifold_parts'],(family,s['nonmanifold_parts'])
    expected={'lounger':([- .60001,-1.20001,-.06001],[.60001,1.20001,.29501]),'console':([-.68001,-2.50001,0],[.71001,2.50001,.92001]),'speaker':([-.45001,-.39001,0],[.50251,.39001,1.67501])}
    low,high=expected[family]
    for a,b in zip(s['bounds_min'],low):assert a>=b-1e-5,(family,s)
    for a,b in zip(s['bounds_max'],high):assert a<=b+1e-5,(family,s)

def presentation():
    U.rig();s=bpy.context.scene;s.render.threads=3;s.render.resolution_x=960;s.render.resolution_y=768;s.cycles.samples=16
def render(name):U.render(name,16)
def show_family(collections,name):
    for key,c in collections.items():c.hide_render=key!=name
def camera_for(family):
    # The lounger root is the old slab center datum,60mm above its lowest timber.
    # Keep the whole real frame visible; each family's before/after/clay ground matches.
    bpy.data.objects['Studio ground'].location.z=-.078 if family=='lounger' else -.018
    if family=='lounger':U.camera((2.5,3.4,2.6),(0,0,.1),3.2)
    elif family=='console':U.camera((3.6,5,3.3),(0,0,.45),6)
    else:U.camera((3,3.4,2.3),(0,0,.83),2.7)
def baseline(family,c,data):
    origin=data['originWorld'][family]
    for i,p in enumerate(data['families'][family]):
        m=U.material('SOURCE '+p['kind'],p['color'].lstrip('#'),.85 if p['kind']=='wood' else .94 if p['kind']=='fabric' else .49,.35 if p['kind']=='metal' else 0)
        a=p['positions'];v=[(a[k]-origin[0],origin[2]-a[k+2],a[k+1]-origin[1]) for k in range(0,len(a),3)]
        me=bpy.data.meshes.new('Exact source triangles');me.from_pydata(v,[],[(k,k+1,k+2) for k in range(0,len(v),3)]);me.update()
        o=bpy.data.objects.new('Actual source '+family+' '+str(i),me);c.objects.link(o);me.materials.append(m)
        for face in me.polygons:face.use_smooth=True
        n=p['normals'];me.normals_split_custom_set([(n[k],-n[k+2],n[k+1]) for k in range(0,len(n),3)])

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    data=json.loads((OUT/'baseline-captured.json').read_text());M=U.palette()
    # Teal from the existing accepted pool upholstery; retain neutral physical weave maps.
    cloth=M['cloth'];cloth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*U.rgb('43827e'),1)
    for node in list(cloth.node_tree.nodes):
        if node.type=='TEX_IMAGE' and node.image.name.startswith('Authored neutral sand canvas color'):
            im=node.image;pixels=list(im.pixels);base=U.rgb('43827e');old=U.rgb('cabc9e')
            for i in range(0,len(pixels),4):
                for j in range(3):pixels[i+j]*=base[j]/old[j]
            im.pixels.foreach_set(pixels);im.pack()
    cloth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,1,1,1)
    M['binding']=U.material('02 Teal cover binding and timber join plugs','356864',.86)
    M['rubber']=U.material('05 Flexible speaker rubber and foot isolation','1d2624',.81)
    M['speaker']=U.material('06 Fine textured painted speaker cabinet','303a36',.76)
    # Fine authored cabinet roughness survives GLB; no photographic claim.
    import numpy as np
    y,x=np.mgrid[:512,:512];r=.72+.07*np.sin(x*1.83)*np.sin(y*2.13)
    U.connect(M['speaker'],U.image('Authored cabinet coating roughness512',np.repeat(r[:,:,None],3,2),True),'Roughness')
    texture_sources=json.loads((OUT/'texture-sources.json').read_text())
    texture_sources[-1]['usage']='Deterministically authored teal upholstery color/roughness/normal,0.6m tile and2mm thread pitch; speaker coating roughness512; not scans'
    (OUT/'texture-sources.json').write_text(json.dumps(texture_sources,indent=2))
    assets={};baselines={};stats={}
    for family,build in [('lounger',lounger),('console',console),('speaker',speaker)]:
        c=U.collection('ASSET | '+family);assets[family]=c;build(c,M);apply_parts(c);stats[family]=native_stats(c);check(family,stats[family])
        old=U.collection('BASELINE | '+family);baselines[family]=old;baseline(family,old,data);old.hide_render=True
    presentation()
    for c in assets.values():c.hide_render=True
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'furniture-editable.blend'))
    for family in assets:
        camera_for(family);show_family(baselines,family);render(family+'-before.png');baselines[family].hide_render=True
        show_family(assets,family);render(family+'-after.png');assets[family].hide_render=True
    runtime=U.collection('RUNTIME | family material batches')
    for family,c in assets.items():
        parent=bpy.data.objects.new('DJC_Furniture_'+family,None);runtime.objects.link(parent);groups={}
        for source in c.all_objects:
            if source.type!='MESH':continue
            o=source.copy();o.data=source.data.copy();runtime.objects.link(o);groups.setdefault(o.data.materials[0].name,[]).append(o)
        for index,objects in enumerate(groups.values()):
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=family+'_material_'+str(index)
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.parent=parent
    bpy.ops.object.select_all(action='DESELECT')
    for o in runtime.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'furniture.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'furniture.glb'))
    fresh={}
    for family in assets:
        parent=bpy.data.objects['DJC_Furniture_'+family];objects=[o for o in parent.children_recursive if o.type=='MESH'];fresh[family]=U.stats(objects)
        check(family,fresh[family]);assert fresh[family]['triangles']==stats[family]['triangles'];assert max(abs(a-b) for a,b in zip(fresh[family]['dimensions'],stats[family]['dimensions']))<1e-5
    presentation();imported={family:bpy.data.objects['DJC_Furniture_'+family] for family in assets}
    for parent in imported.values():
        for o in parent.children_recursive:o.hide_render=True
    for family,parent in imported.items():
        for o in parent.children_recursive:o.hide_render=False
        camera_for(family);render(family+'-fresh-glb.png')
        bpy.context.view_layer.material_override=U.material('RIG clay','b8b3a6',.73);render(family+'-clay.png');bpy.context.view_layer.material_override=None
        for o in parent.children_recursive:o.hide_render=True
    blob=(OUT/'furniture.glb').read_bytes();g=json.loads(blob[20:20+int.from_bytes(blob[12:16],'little')]);assert len(g.get('meshes',[]))<=13
    assert not g.get('animations') and not g.get('cameras');assert all('bufferView' in im for im in g['images'])
    files=['furniture.glb','furniture-editable.blend','baseline-captured.json']+[family+'-'+suffix+'.png' for family in assets for suffix in ['before','after','fresh-glb','clay']]
    info={'status':'technical_export_complete_visual_review_pending','families':list(assets),'native':stats,'fresh_glb':fresh,'revision':'0118dfc','glb_bytes':len(blob),'materials':len(g['materials']),'meshes':len(g['meshes']),'embedded_images':len(g['images']),'render':{'engine':'Cycles CPU','threads':3,'samples':16,'resolution':[960,768],'exposure':0,'look':'AgX Medium High Contrast','cameras':{'lounger':{'position':[2.5,3.4,2.6],'target':[0,0,.1],'ortho_scale':3.2},'console':{'position':[3.6,5,3.3],'target':[0,0,.45],'ortho_scale':6},'speaker':{'position':[3,3.4,2.3],'target':[0,0,.83],'ortho_scale':2.7}},'lights':'Read-only accepted umbrella rig:3large area lights; transforms/energies in imported rig helper; no depth of field'},'browser_verification':'coordinator pending','images_inspected':False,'hashes':{p:hashlib.sha256((OUT/p).read_bytes()).hexdigest() for p in files}}
    (OUT/'manifest.json').write_text(json.dumps(info,indent=2));print('FURNITURE_FINISH_OK',json.dumps({'triangles':{k:v['triangles'] for k,v in fresh.items()},'bytes':len(blob)}))

if __name__=='__main__':main()
