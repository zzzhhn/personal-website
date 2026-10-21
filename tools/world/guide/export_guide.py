"""Export G24: uncompressed proof GLB (tools/world/guide/out) and Draco runtime GLB (public).
Run: Blender -b tools/world/guide/blend/G24.blend --python-exit-code 1 -P export_guide.py"""
import bpy, hashlib, json, os
REPO = '/Users/bobby/WorkBuddy/personal-website/personal-website'
OUT = f'{REPO}/tools/world/guide/out'
PUB = f'{REPO}/public/assets/world/guide'
os.makedirs(OUT, exist_ok=True); os.makedirs(PUB, exist_ok=True)
ao = bpy.data.objects['G24']; me = bpy.data.objects['G24_mesh']
for o in bpy.context.scene.objects:
    o.select_set(o in (ao, me))
bpy.context.view_layer.objects.active = ao
ao.animation_data.action = None
for tr in ao.animation_data.nla_tracks:
    tr.mute = True
props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
need = ['export_skins', 'export_animation_mode', 'export_force_sampling', 'export_influence_nb', 'export_all_influences',
        'export_rest_position_armature', 'export_def_bones', 'export_anim_slide_to_zero', 'export_optimize_animation_size',
        'export_draco_mesh_compression_enable', 'export_draco_generic_quantization']
missing = [p for p in need if p not in props]
assert not missing, missing
base = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_normals=True,
            export_materials='EXPORT', export_extras=True, export_cameras=False, export_lights=False,
            export_skins=True, export_influence_nb=4, export_all_influences=False, export_def_bones=False,
            export_rest_position_armature=True, export_animations=True, export_animation_mode='ACTIONS',
            export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True,
            export_optimize_animation_size=False, export_morph=False, export_texcoords=False)
res = {}
for tag, path, draco in (('uncompressed', f'{OUT}/G24_uncompressed.glb', False), ('draco', f'{PUB}/G24.glb', True)):
    kw = dict(base, filepath=path)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                  export_draco_position_quantization=18, export_draco_normal_quantization=10,
                  export_draco_generic_quantization=16)
    bpy.ops.export_scene.gltf(**kw)
    res[tag] = dict(path=path, bytes=os.path.getsize(path), sha256=hashlib.sha256(open(path, 'rb').read()).hexdigest())
json.dump(res, open(f'{OUT}/export_hashes.json', 'w'), indent=1)
print('EXPORT', json.dumps(res))
