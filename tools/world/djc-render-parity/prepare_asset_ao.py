"""Add one geometry-only AO atlas on UV1. Source file and all UV0 PBR maps stay intact.

Run only after heavy-work scheduling. A dry run works in ordinary Python.
"""
import argparse, hashlib, json, struct, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
DEFAULT_SOURCE=ROOT/'docs/world/phase-2-playground/djc-daybed-craft-20261101/daybed-v1.glb'
DEFAULT_OUT=ROOT/'docs/world/phase-2-playground/djc-render-parity-20261101/asset-ao'

def glb_read(path):
    raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]
def glb_write(path,data,binary):
    data['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(data,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    binary+=b'\0'*((-len(binary))%4)
    Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
def image_hash(data,binary,index):
    view=data['bufferViews'][data['images'][index]['bufferView']];offset=view.get('byteOffset',0)
    return hashlib.sha256(binary[offset:offset+view['byteLength']]).hexdigest()
def pbr_signature(data,binary):
    result={}
    for m in data['materials']:
        p=m.get('pbrMetallicRoughness',{});entry={k:p.get(k,d) for k,d in [('baseColorFactor',[1,1,1,1]),('metallicFactor',1),('roughnessFactor',1)]}
        entry['alphaMode']=m.get('alphaMode','OPAQUE');entry['emissiveFactor']=m.get('emissiveFactor',[0,0,0])
        for key,ref in [('base',p.get('baseColorTexture')),('rough',p.get('metallicRoughnessTexture')),('normal',m.get('normalTexture'))]:
            if ref:
                tex=data['textures'][ref['index']];entry[key]=dict(image_sha256=image_hash(data,binary,tex['source']),uv=ref.get('texCoord',0),scale=ref.get('scale',1))
        result[m['name']]=entry
    return result
def add_ao(glb_path,png,strength):
    data,binary=glb_read(glb_path);binary+=b'\0'*((-len(binary))%4);offset=len(binary);payload=png.read_bytes()
    view=len(data['bufferViews']);data['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(payload)))
    image=len(data.setdefault('images',[]));data['images'].append(dict(name='Daybed geometry AO shared UV1',mimeType='image/png',bufferView=view))
    sampler=len(data.setdefault('samplers',[]));data['samplers'].append(dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071))
    texture=len(data.setdefault('textures',[]));data['textures'].append(dict(source=image,sampler=sampler))
    for m in data['materials']:m['occlusionTexture']=dict(index=texture,texCoord=1,strength=strength)
    assert all('TEXCOORD_1' in p['attributes'] for mesh in data['meshes'] for p in mesh['primitives'])
    glb_write(glb_path,data,binary+payload)

def restore_emission_precision(candidate,source_json):
    data,binary=glb_read(candidate);original={m['name']:m for m in source_json['materials']}
    for m in data['materials']:
        expected=original[m['name']].get('emissiveFactor',[0,0,0]);actual=m.get('emissiveFactor',[0,0,0])
        assert max(abs(a-b) for a,b in zip(expected,actual))<1e-7
        if 'emissiveFactor' in original[m['name']]:m['emissiveFactor']=expected
    glb_write(candidate,data,binary)

def main(args):
    source=args.source.resolve();out=args.out.resolve()
    assert source.is_file() and source.suffix=='.glb'
    assert out not in source.parents and 'public' not in out.parts
    plan=dict(source=str(source),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),out=str(out),atlas=args.size,distance_m=args.distance,cycles_samples=args.samples,ao_node_samples=args.ao_samples,threads=4,padding_px=args.margin,occlusion_strength=args.strength)
    if args.dry_run:print(json.dumps(plan,indent=2));return
    import bpy, bmesh, numpy as np
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    start=time.monotonic();out.mkdir(parents=True,exist_ok=True)
    def note(stage):print('AO_STAGE',stage,round(time.monotonic()-start,2),flush=True)
    def choose(objects):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
    def mesh_hash(o,field):
        if field=='UV0':
            a=np.empty(len(o.data.loops)*2,np.float32);o.data.uv_layers[0].data.foreach_get('uv',a)
        elif field=='NORMAL':
            a=np.empty(len(o.data.loops)*3,np.float32);o.data.corner_normals.foreach_get('vector',a)
        else:
            a=np.empty(len(o.data.vertices)*3,np.float32);o.data.vertices.foreach_get('co',a)
        return hashlib.sha256(a.tobytes()).hexdigest()
    def measurements(objects):
        vs=[];fs=[];tris=0
        for o in objects:
            base=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices)
            fs.extend(tuple(base+i for i in p.vertices) for p in o.data.polygons)
            o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
        low=[min(p[i] for p in vs) for i in range(3)];high=[max(p[i] for p in vs) for i in range(3)]
        tree=BVHTree.FromPolygons(vs,fs);heights=[]
        for x in (-.95,.95):
            for dx in np.linspace(-.1,.1,5):
                for dy in np.linspace(-.1,.1,5):
                    hit,*_=tree.ray_cast(Vector((x+dx,.85+dy,3)),Vector((0,0,-1)),5)
                    assert hit is not None;heights.append(hit.z)
        return dict(triangles=tris,bounds_min=low,bounds_max=high,seat_samples=50,seat_max_deviation_m=max(abs(z-.255) for z in heights))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=False)
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];before=measurements(objects)
    source_json,source_bin=glb_read(source);signature=pbr_signature(source_json,source_bin)
    assert len(objects)==8 and len(signature)==8
    choose(objects);bpy.ops.object.join();asset=bpy.context.object;asset.name='Daybed_AO_working_geometry'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    assert len(asset.data.uv_layers)==1
    asset.data.uv_layers[0].name='UVMap';uv0_before=mesh_hash(asset,'UV0');positions_before=mesh_hash(asset,'POSITION');normals_before=mesh_hash(asset,'NORMAL')
    # glTF vertices are split at shading/UV0 seams. Unwrap a welded temporary
    # proxy; transferring only loop UV1 keeps production topology/normals intact.
    proxy=asset.copy();proxy.data=asset.data.copy();bpy.context.scene.collection.objects.link(proxy);proxy.name='TEMP UV proxy only'
    bm=bmesh.new();bm.from_mesh(proxy.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    pending=set(bm.verts);tiny=[];component_count=0;tiny_count=0
    while pending:
        seed=pending.pop();component={seed};stack=[seed]
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                q=e.other_vert(v)
                if q in pending:pending.remove(q);component.add(q);stack.append(q)
        component_count+=1
        span=max(max(v.co[i] for v in component)-min(v.co[i] for v in component) for i in range(3))
        if span<.03:tiny.extend(component);tiny_count+=1
    # Keep all components in this probe. Correct packing, rather than removing
    # details or weakening the coverage guard, must solve the atlas density.
    bm.to_mesh(proxy.data);bm.free();proxy.data.update()
    proxy_uv=proxy.data.uv_layers.new(name='AO_PROXY');proxy.data.uv_layers.active_index=1;proxy_uv.active_render=True
    choose([proxy]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    unwrap=dict(angle_limit=1.1519173063162575,island_margin=0,area_weight=.25,correct_aspect=True)
    bpy.ops.uv.smart_project(**unwrap)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=args.margin/args.size)
    bpy.ops.object.mode_set(mode='OBJECT')
    proxy_uv=proxy.data.uv_layers['AO_PROXY']
    def point_key(v):return tuple(int(round(float(x)*1e6)) for x in v)
    def face_key(me,p):return tuple(sorted(point_key(me.vertices[i].co) for i in p.vertices))
    transfer={};border=args.margin/args.size*2
    for p in proxy.data.polygons:
        transfer[face_key(proxy.data,p)]={point_key(proxy.data.vertices[proxy.data.loops[li].vertex_index].co):(float(proxy_uv.data[li].uv.x)*(1-2*border)+border,float(proxy_uv.data[li].uv.y)*(1-2*border)+border) for li in p.loop_indices}
    ao_uv=asset.data.uv_layers.new(name='AO_UV');missing=0
    for p in asset.data.polygons:
        face=transfer.get(face_key(asset.data,p))
        if face is None:missing+=1
        for li in p.loop_indices:
            key=point_key(asset.data.vertices[asset.data.loops[li].vertex_index].co)
            ao_uv.data[li].uv=face[key] if face else (.9998,.9998)
    bpy.data.objects.remove(proxy,do_unlink=True)
    choose([asset]);asset.data.uv_layers.active_index=1;ao_uv.active_render=True
    assert mesh_hash(asset,'UV0')==uv0_before and mesh_hash(asset,'POSITION')==positions_before and mesh_hash(asset,'NORMAL')==normals_before
    # Measure useful atlas coverage and density before spending time baking.
    density={};asset.data.calc_loop_triangles();coverage=0
    for t in asset.data.loop_triangles:
        uv=[ao_uv.data[li].uv for li in t.loops];a=uv[1]-uv[0];b=uv[2]-uv[0];area=abs(a.x*b.y-a.y*b.x)*.5
        coverage+=area;name=asset.data.materials[asset.data.polygons[t.polygon_index].material_index].name
        entry=density.setdefault(name,dict(world_area=0,uv_area=0))
        if area>1e-15:entry['world_area']+=t.area;entry['uv_area']+=area
    for entry in density.values():entry['pixels_per_m']=float((entry['uv_area']*args.size**2/max(entry['world_area'],1e-12))**.5)
    plan['atlas_allocation']=dict(uv_triangle_area_coverage=coverage,receiver_density=density,proxy_components=component_count,tiny_components_kept=tiny_count,unmatched_proxy_triangles_white=missing,packing='smart_project margin 0, then pack_islands FRACTION margin %d/%d'%(args.margin,args.size),source_geometry_uv0_normals_byte_identical=True)
    (out/'atlas-allocation.json').write_text(json.dumps(plan['atlas_allocation'],indent=2))
    if args.uv_probe:print('UV_PROBE',json.dumps(plan['atlas_allocation']),flush=True);return
    assert coverage>.15,plan['atlas_allocation']
    assert all(v['pixels_per_m']>60 for k,v in density.items() if k.startswith(('03 ','04 ','05 '))),density
    (out/'atlas-allocation.json').write_text(json.dumps(plan['atlas_allocation'],indent=2))
    note('proxy UV1 transferred; coverage %.3f; source UV0/positions/normals byte-identical'%coverage)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.bake.margin=args.margin;scene.render.bake.use_clear=False
    if hasattr(scene.render.bake,'margin_type'):scene.render.bake.margin_type='EXTEND'
    image=bpy.data.images.new('Daybed AO shared UV1',width=args.size,height=args.size,alpha=False,float_buffer=False)
    image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    saved=[]
    for material in asset.data.materials:
        nodes=material.node_tree.nodes;links=material.node_tree.links
        output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');original=[(l.from_socket,l.to_socket) for l in list(output.inputs['Surface'].links)]
        for l in list(output.inputs['Surface'].links):links.remove(l)
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=True;ao.inside=False;ao.samples=args.ao_samples;ao.inputs['Distance'].default_value=args.distance
        emission=nodes.new('ShaderNodeEmission');links.new(ao.outputs['AO'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
        target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target;target.select=True
        saved.append((material,original,[ao,emission,target]))
    choose([asset]);note('bake start')
    bpy.ops.object.bake(type='EMIT')
    note('bake complete')
    pixels=np.empty(args.size*args.size*4,np.float32);image.pixels.foreach_get(pixels);values=pixels[::4]
    ao_stats=dict(min=float(values.min()),mean=float(values.mean()),max=float(values.max()),dark_fraction=float(np.mean(values<.8)))
    assert ao_stats['min']<.95 and ao_stats['max']>.95 and ao_stats['mean']>.4,ao_stats
    png=out/'daybed-ao-uv1.png';image.filepath_raw=str(png);image.file_format='PNG';image.save()
    for material,original,temporary in saved:
        for n in temporary:material.node_tree.nodes.remove(n)
        for source_socket,target_socket in original:material.node_tree.links.new(source_socket,target_socket)
    asset.data.uv_layers.active_index=0;asset.data.uv_layers[0].active_render=True
    assert mesh_hash(asset,'UV0')==uv0_before and mesh_hash(asset,'POSITION')==positions_before and mesh_hash(asset,'NORMAL')==normals_before
    choose([asset]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
    runtime=[o for o in bpy.context.scene.objects if o.type=='MESH'];choose(runtime)
    assert len(runtime)==8
    candidate=out/'daybed-ao-v1.glb'
    bpy.ops.export_scene.gltf(filepath=str(candidate),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_texcoords=True)
    add_ao(candidate,png,args.strength)
    restore_emission_precision(candidate,source_json)
    exported_json,exported_bin=glb_read(candidate)
    assert pbr_signature(exported_json,exported_bin)==signature,'Original PBR factors/encoded images/UV0 references changed'
    note('GLB exported; PBR images and factors unchanged')
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(candidate),merge_vertices=False)
    fresh_objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];after=measurements(fresh_objects)
    assert len(fresh_objects)==8 and after['triangles']==before['triangles']
    assert max(abs(a-b) for key in ('bounds_min','bounds_max') for a,b in zip(after[key],before[key]))<1e-5
    assert after['seat_max_deviation_m']<1e-5
    aotextures={m['occlusionTexture']['index'] for m in exported_json['materials']}
    assert len(aotextures)==1 and all(m['occlusionTexture']['texCoord']==1 for m in exported_json['materials'])
    assert all('TEXCOORD_1' in p['attributes'] for m in exported_json['meshes'] for p in m['primitives'])
    plan.update(before=before,fresh=after,ao_stats=ao_stats,uv0_byte_hash_before_after=uv0_before,positions_byte_hash_before_after=positions_before,source_pbr_signature=signature,ao_shared_texture_count=1,elapsed_seconds=round(time.monotonic()-start,2),candidate_bytes=candidate.stat().st_size,candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest())
    (out/'ao-manifest.json').write_text(json.dumps(plan,indent=2));note('fresh import validated')
    # Diagnostic only: show the actual UV1 AO on the reimported geometry.
    ao_image=next(i for i in bpy.data.images if i.name.startswith('Daybed geometry AO'))
    debug=bpy.data.materials.new('AO debug only');debug.use_nodes=True;nodes=debug.node_tree.nodes;links=debug.node_tree.links
    output=nodes.get('Material Output');emission=nodes.new('ShaderNodeEmission');uv=nodes.new('ShaderNodeUVMap');uv.uv_map=fresh_objects[0].data.uv_layers[1].name
    tex=nodes.new('ShaderNodeTexImage');tex.image=ao_image;links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=4;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.view_settings.view_transform='Standard'
    bpy.context.view_layer.material_override=debug
    cam_data=bpy.data.cameras.new('AO proof camera');cam=bpy.data.objects.new('AO proof camera',cam_data);scene.collection.objects.link(cam);scene.camera=cam
    cam.location=(4.2,5.8,3.3);cam.rotation_euler=(Vector((0,0,-.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.type='ORTHO';cam_data.ortho_scale=4.38
    scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.filepath=str(out/'daybed-ao-debug.png')
    bpy.ops.render.render(write_still=True);note('AO diagnostic complete')

if __name__=='__main__':
    import sys
    argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=DEFAULT_SOURCE);p.add_argument('--out',type=Path,default=DEFAULT_OUT)
    p.add_argument('--size',type=int,default=2048);p.add_argument('--distance',type=float,default=.20);p.add_argument('--samples',type=int,default=8);p.add_argument('--ao-samples',type=int,default=8);p.add_argument('--margin',type=int,default=6);p.add_argument('--strength',type=float,default=.75);p.add_argument('--dry-run',action='store_true');p.add_argument('--uv-probe',action='store_true')
    main(p.parse_args(argv))
