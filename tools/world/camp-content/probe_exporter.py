import bpy
print('VERSION', bpy.app.version_string)
rna = bpy.ops.export_scene.gltf.get_rna_type().properties
for p in rna:
    if any(k in p.identifier for k in ('color','attribute','draco','texcoord','normal')):
        print('OPT', p.identifier, getattr(p,'default',None), [i.identifier for i in getattr(p,'enum_items',[])])
