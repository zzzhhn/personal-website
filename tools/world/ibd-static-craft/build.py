"""Three static equipment families. Native parts use Three Y-up metre coordinates.
No gameplay objects, labels, rollers, samples or control mechanisms are exported.
"""
import bpy, math, json, hashlib, sys, struct
from pathlib import Path
from mathutils import Vector
import numpy as np

TOOLS=Path(__file__).resolve().parent
REPO=TOOLS.parents[2]
OUT=REPO/'docs/world/phase-2-playground/ibd-static-craft-20261101'
PUBLIC=REPO/'public/assets/world/ibd/static-craft'
M={}; ROOT=None; PART=0
def p(v):return Vector((v[0],-v[2],v[1]))
def material(key,color,rough,metal=0):
    m=bpy.data.materials.new('IBD static | '+key);m.use_nodes=True;q=m.node_tree.nodes.get('Principled BSDF')
    q.inputs['Base Color'].default_value=(*color,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal;M[key]=m;return m
def empty(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);o.parent=parent;return o
def select(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def box(name,at,size,mat,bevel=.007,grain=0):
    global PART
    bpy.ops.mesh.primitive_cube_add(size=1,location=p(at));o=bpy.context.object;o.name=name;o.parent=ROOT;o.dimensions=(size[0],size[2],size[1]);select(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[mat])
    uv=o.data.uv_layers.active;axis=[0,2,1][grain];PART+=1
    for poly in o.data.polygons:
        n=max(range(3),key=lambda a:abs(poly.normal[a]));u=axis if n!=axis else (axis+1)%3;v=next(a for a in range(3) if a not in [n,u])
        for li in poly.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv=(co[u]/1.8+(PART*.137)%1,co[v]/.7+(PART*.217)%1)
    if bevel:
        mod=o.modifiers.new('Fabrication edge radius','BEVEL');mod.width=min(bevel,min(size)*.2);mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def rod(name,a,b,r,mat,sides=12):
    a=p(a);b=p(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.parent=ROOT;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(M[mat]);select(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for poly in o.data.polygons:
        if len(poly.vertices)==4:poly.use_smooth=True
    return o
def beam(name,a,b,w,mat):
    a=p(a);b=p(b);d=b-a;o=box(name,(0,0,0),(w,d.length,w),mat,.003);o.location=(a+b)/2;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def bolt(x,y,z):
    rod('Serviceable hex head',(x,y,z-.006),(x,y,z+.014),.021,'galvanized',6)
def texture(name,rgb,space):
    h,w=rgb.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=False);im.colorspace_settings.name=space
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=rgb;im.pixels.foreach_set(rgba.ravel());im.file_format='PNG';im.filepath_raw=str(OUT/(name+'.png'));im.save();im.pack();return im
def maps(m,base,rough,normal):
    nodes=m.node_tree.nodes;links=m.node_tree.links;q=nodes.get('Principled BSDF')
    if base:q.inputs['Base Color'].default_value=(1,1,1,1)
    for im,inputname in [(base,'Base Color'),(rough,'Roughness')]:
        if im is None:continue
        n=nodes.new('ShaderNodeTexImage');n.image=im;links.new(n.outputs['Color'],q.inputs[inputname])
    if normal:
        n=nodes.new('ShaderNodeTexImage');n.image=normal;nmap=nodes.new('ShaderNodeNormalMap');nmap.inputs['Strength'].default_value=.18;links.new(n.outputs['Color'],nmap.inputs['Color']);links.new(nmap.outputs['Normal'],q.inputs['Normal'])
def materials():
    for args in [('paint',(.085,.14,.16),.68,0),('amber',(.68,.34,.035),.66,0),('galvanized',(.44,.50,.52),.43,.78),('brushed',(.52,.56,.57),.34,.84),('rubber',(.022,.029,.031),.92,0),('wood',(.6,.43,.26),.78,0)]:material(*args)
    y,x=np.mgrid[0:512,0:512].astype(np.float32)/512;rng=np.random.default_rng(313)
    fine=rng.normal(0,.006,(512,512));brush=.5+.045*np.sin(y*2*math.pi*71)+fine
    rough=texture('shared-metal-roughness',np.repeat(np.clip(brush,.38,.65)[:,:,None],3,axis=2),'Non-Color')
    normal=np.stack([np.full_like(x,.5),.5+.018*np.sin(y*2*math.pi*71),np.ones_like(x)],axis=2)
    nmap=texture('shared-metal-normal',normal,'Non-Color')
    maps(M['brushed'],None,rough,nmap);maps(M['galvanized'],None,rough,nmap)
    # Low-amplitude coating variation shared across the three families; no painted-in lighting.
    rough=texture('shared-coating-roughness',np.repeat(np.clip(.68+fine*1.3+.018*np.sin(x*2*math.pi*3),.59,.76)[:,:,None],3,axis=2),'Non-Color')
    maps(M['paint'],None,rough,None);maps(M['amber'],None,rough,None)
    tex=REPO/'tools/world/ibd-crate-craft/textures'
    images=[]
    for file,space in [('pine-packaging-basecolor.png','sRGB'),('pine-packaging-roughness.png','Non-Color'),('pine-packaging-normal.png','Non-Color')]:
        im=bpy.data.images.load(str(tex/file));im.colorspace_settings.name=space;im.pack();images.append(im)
    maps(M['wood'],*images)
def inspection():
    global ROOT
    ROOT=empty('InspectionBench')
    # Four RHS legs, broad welded foot plates and orthogonal apron load path.
    for x in [-1.4,1.4]:
        for z in [-1.3,1.3]:
            box('Welded square leg',(x,.35,z),(.18,.7,.18),'paint',.009)
            box('Bolted floor plate',(x,.025,z),(.32,.05,.32),'galvanized',.006)
            box('Corner saddle',(x,.65,z),(.27,.16,.27),'paint',.005)
        box('Longitudinal RHS rail',(x,.71,0),(.18,.22,2.8),'paint')
    for z in [-1.3,1.3]:box('Transverse RHS rail',(0,.71,z),(3,.22,.18),'paint')
    box('Inspection tray bearing plate',(0,.84,0),(3.6,.06,3.2),'paint')
    box('Uninterrupted inspection deck',(0,.94,0),(3.3,.12,3),'brushed',.012)
    for x in [-1.74,1.74]:
        box('Folded tray side edge',(x,.87,0),(.12,.06,3.2),'galvanized',.008)
    for x in [-1.4,1.4]:
        for z in [-1.4,1.4]:bolt(x,.73,z)
    for z in [-1.54,1.54]:box('Folded tray end edge',(0,.87,z),(3.6,.06,.12),'galvanized',.008)
    # Low bracing stays below the physical work tray, clear of every sample.
    for z in [-1.3,1.3]:beam('Under-tray diagonal tie',(-1.34,.18,z),(1.34,.57,z),.065,'galvanized')
    for x in [-1.4,1.4]:box('Lower leg stretcher',(x,.19,0),(.1,.1,2.6),'paint')
def utility():
    global ROOT
    family=empty('UtilityBench')
    for name,top in [('Receiving',.8),('Tools',1.1)]:
        ROOT=empty(name,family)
        # The .16m top is built as real boards; the height variants are authored,
        # not scaled, so timber section and steel hardware remain equal.
        for z in [-.4,0,.4]:box('Grain-aligned thick bench board',(0,top,z),(2.2,.16,.4),'wood',.004)
        for x in [-.85,.85]:
            for z in [-.39,.39]:box('Steel bench upright',(x,(top-.08)/2,z),(.13,top-.08,.13),'paint')
            box('Full-depth ground shoe',(x,.035,0),(.24,.07,.9),'galvanized')
            box('Timber underside bearer',(x,top-.13,0),(.22,.1,1.12),'paint')
            beam('Rear triangulated side support',(x,.12,-.38),(x,top-.18,.38),.045,'galvanized')
        for z in [-.4,.4]:box('Apron rail below boards',(0,top-.19,z),(1.7,.12,.09),'paint')
        box('Retained amber rear work stop',(0,top+.14,-.48),(2,.12,.12),'amber',.009)
        for x in [-.85,.85]:
            box('Backstop bracket',(x,top+.02,-.48),(.08,.24,.08),'galvanized',.004)
            for z in [-.445,.445]:bolt(x,top-.19,z)
def pedestal():
    global ROOT
    family=empty('ControlPedestal')
    for name,height in [('Standard',1.2),('Crane',.8)]:
        ROOT=empty(name,family)
        box('Anchored plinth',(0,.09,0),(.95,.16,.84),'galvanized',.012)
        # Folded steel walls surround a recessed removable maintenance door.
        for x in [-.382,.382]:box('Folded cabinet side',(x,height/2,0),(.036,height,.7),'paint')
        box('Cabinet rear wall',(0,height/2,-.332),(.8,height,.036),'paint')
        for x in [-.35,.35]:box('Front door reveal stile',(x,height/2,.324),(.1,height,.052),'paint',.005)
        box('Inset service door',(0,height/2,.303),(.59,height-.15,.035),'paint',.01)
        for y in [.12,height-.08]:box('Welded front cross fold',(0,y,.323),(.8,.08,.054),'paint',.005)
        box('Door recessed pull',(0,height*.56,.332),(.12,.025,.025),'galvanized',.004)
        for y in [.19,height-.18]:box('Service door exposed hinge',(-.307,y,.344),(.045,.09,.025),'galvanized',.004)
        for x in [-.36,.36]:
            for z in [-.29,.29]:rod('Plinth fixing',(x,.168,z),(x,.185,z),.026,'galvanized',6)
        # Cap is exactly the original .16m slab. Existing controls are retained above it.
        box('Amber operator cap',(0,height+.05,0),(1,.16,.9),'amber',.014)
        for i in range(5):box('Side cabinet ventilation return',(.404,height*.37+i*.032,-.13),(.012,.012,.2),'rubber',.002)
def stats(objects):
    mesh=[o for o in objects if o.type=='MESH'];tris=0;bad=0;finite=0
    for o in mesh:
        o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
        for v in o.data.vertices:finite+=int(not all(math.isfinite(a) for a in v.co))
        for t in o.data.loop_triangles:
            a,b,c=[o.data.vertices[i].co for i in t.vertices];bad+=int((b-a).cross(c-a).length<1e-10)
    return dict(meshes=len(mesh),triangles=tris,nonfinite_vertices=finite,degenerate_triangles=bad)
def image_metadata(data,gltf):
    start=20+int.from_bytes(data[12:16],'little')+8;out=[]
    for image in gltf.get('images',[]):
        view=gltf['bufferViews'][image['bufferView']];offset=start+view.get('byteOffset',0);blob=data[offset:offset+view['byteLength']]
        dimensions=list(struct.unpack('>II',blob[16:24])) if blob.startswith(b'\x89PNG\r\n\x1a\n') else None
        out.append(dict(name=image.get('name'),mimeType=image.get('mimeType'),dimensions=dimensions,bytes=len(blob),sha256=hashlib.sha256(blob).hexdigest()))
    return out
def rig():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=3
    scene.render.resolution_x=960;scene.render.resolution_y=768;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    if scene.world is None:scene.world=bpy.data.worlds.new('Neutral review world')
    scene.world.color=(.12,.12,.12)
    bpy.ops.mesh.primitive_plane_add(size=200,location=p((0,-.006,0)));ground=bpy.context.object;ground.name='RIG | neutral ground';ground.data.materials.append(material('rig ground',(.21,.23,.24),.86))
    bpy.ops.object.camera_add();scene.camera=bpy.context.object;scene.camera.data.type='ORTHO'
    for at,power,size in [((2,6,4),850,5),((-4,3,-2),500,4)]:
        bpy.ops.object.light_add(type='AREA',location=p(at));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
def frame(root,filename,clay=False,variant=None,family=None):
    for o in bpy.context.scene.objects:
        if o.type=='MESH':o.hide_render=True
    for o in root.children_recursive:
        if o.type=='MESH':o.hide_render=False
    bpy.data.objects['RIG | neutral ground'].hide_render=False
    camera=bpy.context.scene.camera;camera.location=p((4.8,3.7,5.4));target=p((0,.55,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=5.7
    family=family or root.name
    if family in ['UtilityBench','ControlPedestal']:
        # Each height variant gets its own camera-matched image. No overlapping
        # alternatives or presentation transforms are included in the asset.
        for childroot in root.children:
            if childroot.type=='EMPTY' and childroot.name!=variant:
                for child in childroot.children_recursive:child.hide_render=True
        camera.data.ortho_scale=3.6 if family=='UtilityBench' else 2.5;camera.location=p((3,2.5,3.8));camera.rotation_euler=(p((0,.65,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene
    if clay:
        mat=material('review clay',(.48,.48,.48),.8);scene.view_layers[0].material_override=mat
    scene.render.filepath=str(OUT/filename);bpy.ops.render.render(write_still=True);scene.view_layers[0].material_override=None
def baseline():
    captures=json.loads((TOOLS/'baseline-equipment.json').read_text())['captures'];roots={};materials={}
    for name,c in captures.items():
        root=empty('BASELINE | '+name);count=len(c['position'])//3;data=bpy.data.meshes.new('Frozen builder | '+name)
        data.from_pydata([p(c['position'][i:i+3]) for i in range(0,len(c['position']),3)],[],[(i,i+1,i+2) for i in range(0,count,3)]);data.update()
        data.normals_split_custom_set_from_vertices([p(c['normal'][i:i+3]) for i in range(0,len(c['normal']),3)])
        color=data.color_attributes.new(name='LegacyColor',type='FLOAT_COLOR',domain='POINT')
        for i in range(count):color.data[i].color=(*c['color'][i*3:i*3+3],1)
        o=bpy.data.objects.new('Actual frozen shell | '+name,data);bpy.context.scene.collection.objects.link(o);o.parent=root
        slots={}
        for poly in data.polygons:
            id=poly.vertices[0];r,metal=c['surface'][id*4:id*4+2];key=(round(r,5),round(metal,5))
            if key not in materials:
                m=material('baseline surface '+str(key),(1,1,1),r,metal);q=m.node_tree.nodes.get('Principled BSDF');n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='LegacyColor';m.node_tree.links.new(n.outputs['Color'],q.inputs['Base Color']);materials[key]=m
            if key not in slots:slots[key]=len(data.materials);data.materials.append(materials[key])
            poly.material_index=slots[key]
        roots[name]=root
    return roots
def main():
    OUT.mkdir(parents=True,exist_ok=True);PUBLIC.mkdir(parents=True,exist_ok=True);bpy.ops.wm.read_factory_settings(use_empty=True);materials();inspection();utility();pedestal()
    roots=[bpy.data.objects[name] for name in ['InspectionBench','UtilityBench','ControlPedestal']]
    native={root.name:stats(root.children_recursive) for root in roots};assert all(not v['nonfinite_vertices'] and not v['degenerate_triangles'] for v in native.values()),native
    rig()
    # Open the editable file on the inspection assembly, with alternative roots
    # available by unhiding them in the Outliner rather than piled on top.
    camera=bpy.context.scene.camera;camera.location=p((4.8,3.7,5.4));camera.rotation_euler=(p((0,.55,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=5.7
    for root in roots:
        for o in [root,*root.children_recursive]:o.hide_set(root.name!='InspectionBench')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'static-craft-editable.blend'))
    for root in roots:
        for o in [root,*root.children_recursive]:o.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.select_set(True)
        for o in root.children_recursive:o.select_set(True)
    asset=PUBLIC/'static-craft-v1.glb';bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    data=asset.read_bytes();gltf=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);rootnodes=[gltf['nodes'][i] for i in gltf['scenes'][gltf.get('scene',0)]['nodes']]
    assert {n['name'] for n in rootnodes}=={r.name for r in roots};assert all('translation' not in n and 'rotation' not in n and 'scale' not in n for n in rootnodes),rootnodes
    views=[('InspectionBench',None),('UtilityBench','Receiving'),('UtilityBench','Tools'),('ControlPedestal','Standard'),('ControlPedestal','Crane')]
    for name,variant in views:
        root=bpy.data.objects[name];stem=name+('-'+variant if variant else '')
        frame(root,stem+'-native.png',variant=variant);frame(root,stem+'-clay.png',True,variant)
    for stem,root in baseline().items():frame(root,stem+'-before.png',family=stem.split('-')[0])
    # Read the actual portable export into a new scene and use the same camera rig.
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(asset));roots=[bpy.data.objects[name] for name in ['InspectionBench','UtilityBench','ControlPedestal']];fresh={r.name:stats(r.children_recursive) for r in roots};rig()
    for name,variant in views:
        root=bpy.data.objects[name];stem=name+('-'+variant if variant else '');frame(root,stem+'-fresh.png',variant=variant)
    variants={root.name:{child.name:stats(child.children_recursive) for child in root.children if child.type=='EMPTY'} for root in roots if root.name!='InspectionBench'}
    runtime_triangles=2*fresh['InspectionBench']['triangles']+sum(v['triangles'] for v in variants['UtilityBench'].values())+9*variants['ControlPedestal']['Standard']['triangles']+variants['ControlPedestal']['Crane']['triangles']
    manifest=dict(schema=1,baseline='0118dfc',units='metres',roots=rootnodes,native=native,fresh=fresh,variants=variants,runtime_triangles=runtime_triangles,glb_bytes=len(data),materials=gltf['materials'],images=image_metadata(data,gltf),blender=bpy.app.version_string,renderer='Cycles, AgX, 24 samples, 960x768, 3 threads',source={'geometry':'Original authored geometry','metal_and_coating_maps':'Original deterministic procedural maps, 512x512','timber':json.loads((REPO/'tools/world/ibd-crate-craft/textures/sources.json').read_text())},runtime='14 placements, merged by shared physical material, original collision proxies and mechanisms unchanged',verification={'fresh_import':True,'clay_rendered':True,'browser':False,'human_visual_acceptance':False},hashes={str(f.relative_to(REPO)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [asset,OUT/'static-craft-editable.blend']})
    manifest['hashes'].update({str(f.relative_to(REPO)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [*OUT.glob('*.png'),TOOLS/'baseline-equipment.json',TOOLS/'baseline-source-hashes.json']})
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('STATIC_CRAFT_OK',json.dumps(dict(native=native,fresh=fresh,bytes=len(data))))
if __name__=='__main__':main()
