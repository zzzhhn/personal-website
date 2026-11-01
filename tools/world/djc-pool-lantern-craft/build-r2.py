"""Material-only r2. Retain the r1 geometry and both UV layouts verbatim."""
import bpy,sys,json,hashlib,math,struct
from pathlib import Path
import numpy as np
from mathutils import Vector
TOOLS=Path(__file__).resolve().parent
sys.path.insert(0,str(TOOLS))
import build as craft
BASE=craft.OUT
OUT=BASE/'r2'
craft.OUT=OUT

def select(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj

def mesh_hash(obj):
    m=obj.data;parts={}
    for name,col,prop,n in [('position',m.vertices,'co',3),('corner_normal',m.corner_normals,'vector',3),('loop_vertex',m.loops,'vertex_index',1)]:
        a=np.empty(len(col)*n,dtype=np.int32 if n==1 else np.float32);col.foreach_get(prop,a);parts[name]=hashlib.sha256(a.tobytes()).hexdigest()
    for layer in m.uv_layers:
        a=np.empty(len(layer.data)*2,np.float32);layer.data.foreach_get('uv',a);parts[layer.name]=hashlib.sha256(a.tobytes()).hexdigest()
    return parts

def wood_identity():
    changed=[]
    for m in bpy.data.materials:
        if not m.name.startswith('DJC_Lantern_Timber'):continue
        p=m.node_tree.nodes.get('Principled BSDF');previous=p.inputs['Base Color'].links[0].from_node
        if previous.type=='MIX':
            source=previous.inputs[6].links[0].from_socket
            m.node_tree.links.new(source,p.inputs['Base Color'])
        p.inputs['Base Color'].default_value=(1,1,1,1);changed.append(m.name)
    return changed

def ao_stats(obj,im,xlimit=.065,bottom=.475,top=.665):
    """Sample actual outer panel triangle centroids away from timber edges."""
    obj.data.calc_loop_triangles();uv=obj.data.uv_layers['UV1_AO']
    pixels=np.empty(im.size[0]*im.size[1]*4,np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(im.size[1],im.size[0],4)[:,:,0]
    values=[];residual=[]
    for t in obj.data.loop_triangles:
        c=sum((obj.data.vertices[i].co for i in t.vertices),Vector())/3
        if c.y<-.0938 and abs(c.x)<xlimit and bottom<c.z<top and t.normal.y<-.9:
            q=sum((uv.data[li].uv for li in t.loops),Vector((0,0)))/3
            yy=min(im.size[1]-1,int(q.y*im.size[1]));xx=min(im.size[0]-1,int(q.x*im.size[0]));value=float(pixels[yy,xx])
            values.append(value);residual.append(value-float(np.median(pixels[max(0,yy-2):yy+3,max(0,xx-2):xx+3])))
    assert len(values)>20,len(values)
    a=np.array(values);return dict(samples=len(values),mean=float(a.mean()),std=float(a.std()),percentiles=np.percentile(a,[1,10,50,90,99]).tolist(),high_frequency_residual_std_5pxmedian=float(np.std(residual)),selection=dict(outer_front_native_y_max=-.0938,abs_x_max=xlimit,z_range=[bottom,top]))

def bake():
    bpy.ops.wm.open_mainfile(filepath=str(BASE/'pool-lantern-editable.blend'))
    runtime=next(c for c in bpy.data.collections if c.name.startswith('RUNTIME |'));obj=next(o for o in runtime.objects if o.type=='MESH')
    before=mesh_hash(obj);changed=wood_identity()
    for c in bpy.data.collections:
        if c.name.startswith(('BASELINE |','ASSET |','RIG |')):craft.visible(c,False)
    craft.visible(runtime,True);select(obj)
    scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=3;scene.cycles.samples=256
    im=bpy.data.images.new('Pool lantern r2 short-range AO UV1 512',width=512,height=512,alpha=False);im.colorspace_settings.name='Non-Color'
    state=[]
    for m in obj.data.materials:
        nodes=m.node_tree.nodes;links=m.node_tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        original=output.inputs['Surface'].links[0].from_socket
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Color'].default_value=(1,1,1,1);ao.inputs['Distance'].default_value=.06;ao.only_local=True;ao.inside=False;ao.samples=16
        emission=nodes.new('ShaderNodeEmission');links.new(ao.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
        target=nodes.new('ShaderNodeTexImage');target.image=im;nodes.active=target
        state.append((m,output,original,ao,emission,target))
    obj.data.uv_layers.active=obj.data.uv_layers['UV1_AO']
    scene.render.bake.margin=3;bpy.ops.object.bake(type='EMIT',use_clear=True)
    im.pack();im.filepath_raw=str(OUT/'lantern-r2-ao-uv1.png');im.file_format='PNG';im.save()
    comparison_region=ao_stats(obj,im);center=ao_stats(obj,im,.045,.51,.63)
    assert center['mean']>.98 and center['high_frequency_residual_std_5pxmedian']<.012,center
    # Render the actual baked atlas on the geometry, not the live AO node.
    for m,output,original,ao,emission,target in state:
        uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UV1_AO'
        m.node_tree.links.new(uv.outputs['UV'],target.inputs['Vector']);m.node_tree.links.new(target.outputs['Color'],emission.inputs['Color'])
        state_uv=uv;target['temporary_ao_uv_node']=uv.name
    rig=next(c for c in bpy.data.collections if c.name.startswith('RIG |'));craft.visible(rig,True);craft.camera()
    craft.render('lantern-r2-ao-only.png',24)
    for m,output,original,ao,emission,target in state:
        links=m.node_tree.links;links.new(original,output.inputs['Surface'])
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE' and n!=target and n.image and 'ambient occlusion UV1' in n.image.name:n.image=im
        uv=m.node_tree.nodes.get(target['temporary_ao_uv_node'])
        for n in (ao,emission,target,uv):m.node_tree.nodes.remove(n)
    obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    after=mesh_hash(obj);assert before==after,(before,after)
    craft.visible(runtime,False);craft.visible(next(c for c in bpy.data.collections if c.name.startswith('ASSET |')),True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'pool-lantern-r2-editable.blend'))
    info=dict(parent_glb_sha256=hashlib.sha256((BASE/'pool-lantern-v1.glb').read_bytes()).hexdigest(),blender=bpy.app.version_string,geometry_uv_hashes_before=before,geometry_uv_hashes_after=after,wood_materials_changed=changed,changes=['Wood extra multiplier removed; photographed source image unchanged.','AO replaced by explicit geometry-only AO, .06m distance, Only Local, 256 scene samples, node samples 16.','RIG ground and all presentation geometry excluded from bake.'],unchanged=['11304 triangles,4 materials,UV0,UV1,placement','Cloth baseColor,normal scale .48,roughness .92','512px AO atlas and 3px margin'],ao=dict(distance_m=.06,only_local=True,scene_samples=256,node_samples=16,image_size=[512,512],center=center,comparison_region=comparison_region))
    (OUT/'r2-validation.json').write_text(json.dumps(info,indent=2));print('BAKE_OK',json.dumps(center))

def finish():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'pool-lantern-r2-editable.blend'))
    runtime=next(c for c in bpy.data.collections if c.name.startswith('RUNTIME |'));obj=next(o for o in runtime.objects if o.type=='MESH')
    craft.visible(runtime,True);select(obj)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'pool-lantern-r2.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/'pool-lantern-r2.glb'))
    fresh=craft.stats([o for o in bpy.context.scene.objects if o.type=='MESH']);assert fresh['triangles']==11304 and len(fresh['materials'])==4
    craft.rig();craft.camera();craft.render('lantern-r2-day-fresh-glb.png',24)
    info=json.loads((OUT/'r2-validation.json').read_text());info['fresh']=fresh;info['files']={f:dict(bytes=(OUT/f).stat().st_size,sha256=hashlib.sha256((OUT/f).read_bytes()).hexdigest()) for f in ['pool-lantern-r2.glb','pool-lantern-r2-editable.blend','lantern-r2-ao-uv1.png','lantern-r2-ao-only.png','lantern-r2-day-fresh-glb.png']}
    (OUT/'r2-validation.json').write_text(json.dumps(info,indent=2));print('FINISH_OK',json.dumps(info['files']['pool-lantern-r2.glb']))

if __name__=='__main__':
    phase=sys.argv[sys.argv.index('--')+1]
    if phase=='bake':bake()
    elif phase=='finish':finish()
