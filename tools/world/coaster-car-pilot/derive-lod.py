"""Derive a distant visual only; preserve the approved source and all contacts.

The small LOD export omits images. Runtime binds the original material/texture
objects by name, so distant geometry does not create a second texture upload.
"""
import bpy, json, hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[3]
out = root / 'docs/world/phase-2-playground/coaster-car-astra-pilot-20261104'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out / 'coaster-car.glb'))
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    bpy.context.view_layer.objects.active = obj
    dec = obj.modifiers.new('Distant silhouette reduction', 'DECIMATE')
    dec.ratio = .24
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Names form the material correspondence; no extra texture residency.
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == 'TEX_IMAGE':
                mat.node_tree.nodes.remove(node)
bpy.ops.object.select_all(action='SELECT')
path = out / 'coaster-car-distant.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_animations=False, export_cameras=False,
    export_lights=False)
blob = path.read_bytes()
g = json.loads(blob[20:20 + int.from_bytes(blob[12:16], 'little')])
report = dict(triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),
    meshes=len(g['meshes']), images=len(g.get('images', [])), bytes=len(blob),
    sha256=hashlib.sha256(blob).hexdigest(), sourceSha256=hashlib.sha256((out/'coaster-car.glb').read_bytes()).hexdigest(),
    policy='near source untouched; 44/50m hysteresis; original material and texture identities reused')
assert report['images'] == 0
(out / 'distant-lod.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report), flush=True)
