"""Validate and inspect an existing AO candidate without unwrapping or baking."""
import bpy, importlib.util, json, time, hashlib, numpy as np
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
ao=load_module('ao_protocol',HERE/'prepare_asset_ao.py')
craft=load_module('daybed_measurements',ROOT/'tools/world/djc-daybed-craft/build.py')
OUT=ao.DEFAULT_OUT;source=ao.DEFAULT_SOURCE;candidate=OUT/'daybed-ao-v1.glb'
source_json,source_bin=ao.glb_read(source)
ao.restore_emission_precision(candidate,source_json)
data,binary=ao.glb_read(candidate)
assert ao.pbr_signature(source_json,source_bin)==ao.pbr_signature(data,binary)

def accessor(g,b,index):
    a=g['accessors'][index];view=g['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];item=np.dtype(dtype).itemsize
    return np.ndarray((a['count'],count),dtype=dtype,buffer=b,offset=view.get('byteOffset',0)+a.get('byteOffset',0),strides=(view.get('byteStride',item*count),item))
def corner_uv(g,b):
    result={}
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            uv=accessor(g,b,p['attributes']['TEXCOORD_0']);indices=accessor(g,b,p['indices']).ravel()
            result[g['materials'][p['material']]['name']]=np.sort(uv[indices],axis=0)
    return result
source_uv=corner_uv(source_json,source_bin);new_uv=corner_uv(data,binary)
uv_error=max(float(np.abs(source_uv[n]-new_uv[n]).max()) for n in source_uv)
assert uv_error<1e-6,uv_error

bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=False)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];before=craft.geometry_stats(objects);before_seat=craft.seat_validation(objects)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(candidate),merge_vertices=False)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];after=craft.geometry_stats(objects);after_seat=craft.seat_validation(objects)
assert len(objects)==8 and before['triangles']==after['triangles']
assert max(abs(a-b) for key in ('bounds_min','bounds_max') for a,b in zip(before[key],after[key]))<1e-5
assert after_seat['max_plane_deviation_m']<1e-5
assert after['nonfinite_vertices']==0 and after['degenerate_triangles']==0
ao_refs=[m['occlusionTexture'] for m in data['materials']]
assert len({r['index'] for r in ao_refs})==1 and all(r.get('texCoord')==1 for r in ao_refs)
assert all(set(p['attributes']).issuperset({'TEXCOORD_0','TEXCOORD_1'}) for m in data['meshes'] for p in m['primitives'])
assert len(data['images'])==len(source_json['images'])+1
ao_image=next(i for i in bpy.data.images if i.name.startswith('Daybed geometry AO'))
pixels=np.empty(ao_image.size[0]*ao_image.size[1]*4,np.float32);ao_image.pixels.foreach_get(pixels);values=pixels[::4]
report=dict(source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest(),candidate_bytes=candidate.stat().st_size,before=before,fresh=after,seats=after_seat,uv0_export_max_numeric_difference=uv_error,source_encoded_pbr_images_and_all_factors_exact=True,shared_ao_textures=1,occlusion_texcoord=1,occlusion_strength=ao_refs[0]['strength'],atlas=list(ao_image.size),ao=dict(min=float(values.min()),mean=float(values.mean()),max=float(values.max()),dark_fraction=float(np.mean(values<.8))),bake=dict(distance_m=.2,cycles_samples=8,ao_samples=8,threads=4,margin_px=12,uv_island_margin=24/2048,lighting='short-range geometry only; no rig, world light or baseColor multiplication'))
(OUT/'ao-manifest.json').write_text(json.dumps(report,indent=2))
print('AO_FRESH_VALIDATED',json.dumps({k:report[k] for k in ('candidate_sha256','candidate_bytes','uv0_export_max_numeric_difference','ao')}),flush=True)

debug=bpy.data.materials.new('AO debug only');debug.use_nodes=True;nodes=debug.node_tree.nodes;links=debug.node_tree.links
output=nodes.get('Material Output');emission=nodes.new('ShaderNodeEmission');uv=nodes.new('ShaderNodeUVMap');uv.uv_map=objects[0].data.uv_layers[1].name
tex=nodes.new('ShaderNodeTexImage');tex.image=ao_image;links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=4;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.view_settings.view_transform='Standard';bpy.context.view_layer.material_override=debug
cam_data=bpy.data.cameras.new('AO proof camera');cam=bpy.data.objects.new('AO proof camera',cam_data);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(4.2,5.8,3.3);cam.rotation_euler=(Vector((0,0,-.1))-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.type='ORTHO';cam_data.ortho_scale=4.38
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.filepath=str(OUT/'daybed-ao-debug.png')
bpy.ops.render.render(write_still=True)
