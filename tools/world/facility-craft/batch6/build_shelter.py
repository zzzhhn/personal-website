"""Exact current TS shelter geometry into named editable native + portable PBR.
Run extract_shelter.mjs and prepare_surfaces.py first, then Blender under lock.
Offline PBR is an archive approximation; runtime shader/atlas/time remain authoritative.
"""
from pathlib import Path
import importlib.util
import json
import hashlib
import struct
import bpy

ROOT = Path.cwd()
HERE = ROOT / 'tools/world/facility-craft/batch6'
OUT = ROOT / 'public/assets/world/craft-batch6-facilities'
spec = importlib.util.spec_from_file_location('street_native', ROOT/'tools/world/facility-craft/street/build_native.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
source = HERE/'source/shelter.source.json'
data = json.loads(source.read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
collection = bpy.data.collections.new('shelter.native.L0')
bpy.context.scene.collection.children.link(collection)
original_material = native.material


def material(signature):
    m = original_material(signature)
    if m.get('facilityConfigured'):
        return m
    m['facilityConfigured'] = True
    p = m.node_tree.nodes.get('Principled BSDF')
    slot = -round(signature[3]) if signature[3] < 0 else 0
    if slot == 1:
        # glTF vertex colors hold pigment/.8; the texture is neutral modulation.
        texture = m.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(OUT/'wood-color.png'), check_existing=True)
        texture.image.pack()
        vertex = next(n for n in m.node_tree.nodes if n.type == 'VERTEX_COLOR')
        multiply = m.node_tree.nodes.new('ShaderNodeMixRGB'); multiply.blend_type = 'MULTIPLY'; multiply.inputs[0].default_value = 1
        m.node_tree.links.new(texture.outputs['Color'],multiply.inputs[1]); m.node_tree.links.new(vertex.outputs['Color'],multiply.inputs[2])
        m.node_tree.links.new(multiply.outputs[0], p.inputs['Base Color'])
        for filename, socket in [('wood-rough.png','Roughness'),('wood-normal.png','Normal')]:
            tex = m.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(OUT/filename), check_existing=True)
            tex.image.colorspace_settings.name = 'Non-Color'; tex.image.pack()
            output = tex.outputs['Color']
            if socket == 'Normal':
                bump = m.node_tree.nodes.new('ShaderNodeNormalMap'); bump.inputs['Strength'].default_value = .18
                m.node_tree.links.new(output,bump.inputs['Color']); output=bump.outputs['Normal']
            m.node_tree.links.new(output,p.inputs[socket])
    elif slot == 4:
        p.inputs['Roughness'].default_value = .46
        p.inputs['Alpha'].default_value = .45
        m.diffuse_color = (1,1,1,.45)
        m.use_backface_culling = True
    elif slot in [2,3,5]:
        p.inputs['Roughness'].default_value = {2:.43,3:.3,5:.38}[slot]
        p.inputs['Metallic'].default_value = {2:.08,3:.72,5:.24}[slot]
    return m


native.material = material
# Preserve the exact source file; compensate wood vertex pigment in the archive
# because glTF baseColorFactor cannot legally exceed 1 for neutral/.8.
for node in data['candidate']['L0']:
    # Blender exports 1-V into glTF. Input is already in the runtime/glTF
    # convention, so invert once here to make the exported UV equal TS source.
    node['aSuv'][1::2] = [1-v for v in node['aSuv'][1::2]]
    for i in range(len(node['color'])//3):
        if node['aMat'][i*4+3] == -1:
            node['color'][i*3:i*3+3] = [c/.8 for c in node['color'][i*3:i*3+3]]
root = native.add_nodes(data['candidate']['L0'],collection,'shelter')
bpy.context.scene['runtimeSourceSHA256'] = json.dumps(data['runtimeSourceSHA256'])
bpy.context.scene['archiveBoundary'] = data['archiveBoundary']
bpy.context.scene['sourceJSONSHA256'] = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'native/shelter.blend'), compress=True)
bpy.ops.object.select_all(action='SELECT')
glb=OUT/'shelter-portable.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_attributes=True)
expected=sum(len(o.data.polygons) for o in collection.all_objects if o.type=='MESH')
before=native.bounds(collection)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for obj in meshes:obj.data.calc_loop_triangles()
actual=sum(len(o.data.loop_triangles) for o in meshes)
after=native.bounds(bpy.context.scene.collection)
delta=max(abs(before[i][j]-after[i][j]) for i in range(2) for j in range(3))
assert expected==actual and delta<1e-5,(expected,actual,delta)
raw=glb.read_bytes();size=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+size])
glass=[m for m in document['materials'] if m.get('extras',{}).get('runtimeSign')==-4]
wood=[m for m in document['materials'] if m.get('extras',{}).get('runtimeSign')==-1]
assert glass and all(m.get('alphaMode')=='BLEND' and not m.get('doubleSided',False) for m in glass)
assert wood and all('baseColorTexture' in m['pbrMetallicRoughness'] and 'normalTexture' in m for m in wood)
report={'revision':2,'sourceJSONSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'runtimeSourceSHA256':data['runtimeSourceSHA256'],'nativeTriangles':expected,'freshTriangles':actual,'boundsDelta':delta,
    'archiveBoundary':data['archiveBoundary'],'portableGlassBlendFrontSide':len(glass),'portableWoodWithColorAndNormal':len(wood),
    'glbBytes':glb.stat().st_size,'glbSHA256':hashlib.sha256(glb.read_bytes()).hexdigest()}
(OUT/'shelter-export-report.json').write_text(json.dumps(report,indent=2))
print('BATCH6_SHELTER_REPORT '+json.dumps(report))
