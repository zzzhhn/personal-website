"""Actual rail factory source -> editable archive and fresh-import proof.
Runtime remains the tested Builder/StreetBatch path; no GLB runtime substitution.
"""
from pathlib import Path
import argparse, copy, hashlib, importlib.util, json, struct, sys
import bpy
ROOT=Path.cwd();HERE=ROOT/'tools/world/facility-craft/batch6/rails'
parser=argparse.ArgumentParser();parser.add_argument('--surface-dir',type=Path,required=True)
parser.add_argument('--only',choices=['all','seawall','timber'],default='all')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
spec=importlib.util.spec_from_file_location('street_archive',HERE.parents[1]/'street/build_native.py')
archive=importlib.util.module_from_spec(spec);spec.loader.exec_module(archive);original_material=archive.material
def material(signature):
    m=original_material(signature)
    if m.get('railConfigured'):return m
    m['railConfigured']=True;p=m.node_tree.nodes.get('Principled BSDF');slot=-round(signature[3])if signature[3]<0 else 0
    if slot==1:
        textures={}
        for filename in['wood-color.png','wood-rough.png','wood-normal.png']:
            node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(args.surface_dir/filename),check_existing=True)
            node.image.colorspace_settings.name='sRGB'if filename=='wood-color.png'else'Non-Color';node.image.pack();textures[filename]=node
        vertex=next(n for n in m.node_tree.nodes if n.type=='VERTEX_COLOR')
        multiply=m.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        m.node_tree.links.new(textures['wood-color.png'].outputs['Color'],multiply.inputs[1]);m.node_tree.links.new(vertex.outputs['Color'],multiply.inputs[2]);m.node_tree.links.new(multiply.outputs[0],p.inputs['Base Color'])
        m.node_tree.links.new(textures['wood-rough.png'].outputs['Color'],p.inputs['Roughness'])
        normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.18
        m.node_tree.links.new(textures['wood-normal.png'].outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    elif slot in[2,3]:p.inputs['Roughness'].default_value={2:.43,3:.3}[slot];p.inputs['Metallic'].default_value={2:.08,3:.72}[slot]
    return m
archive.material=material
out=ROOT/'public/assets/world/craft-batch6-rails';native=HERE/'native';out.mkdir(parents=True,exist_ok=True);native.mkdir(parents=True,exist_ok=True)
for family in['seawall','timber']:
    if args.only!='all'and family!=args.only:continue
    bpy.ops.wm.read_factory_settings(use_empty=True);archive.MATERIALS={}
    source=HERE/'source'/f'{family}.source.json';original=json.loads(source.read_text());data=copy.deepcopy(original)
    for node in data['nodes']:
        node['aSuv'][1::2]=[1-v for v in node['aSuv'][1::2]]
        for i in range(len(node['color'])//3):
            if node['aMat'][i*4+3]==-1:node['color'][i*3:i*3+3]=[c/.8 for c in node['color'][i*3:i*3+3]]
    collection=bpy.data.collections.new(f'{family}.editable');bpy.context.scene.collection.children.link(collection)
    archive.add_nodes(data['nodes'],collection,family)
    bpy.context.scene['sourceJSONSHA256']=hashlib.sha256(source.read_bytes()).hexdigest();bpy.context.scene['archiveBoundary']=data['archiveBoundary']+' Static PBR archive; runtime shared environment/night/fade remain authoritative.'
    bpy.ops.wm.save_as_mainfile(filepath=str(native/f'{family}.blend'),compress=True);bpy.ops.object.select_all(action='SELECT')
    file=out/f'{family}-portable.glb';bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_yup=True,export_attributes=True,export_extras=True)
    raw=file.read_bytes();size=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+size])
    assert all('COLOR_0'in p['attributes']for mesh in document['meshes']for p in mesh['primitives'])
    wood=[i for i,m in enumerate(document['materials'])if m.get('extras',{}).get('runtimeSign')==-1]
    if family=='timber':
        assert wood and all('baseColorTexture'in document['materials'][i]['pbrMetallicRoughness']and'normalTexture'in document['materials'][i]for i in wood)
        assert all('TEXCOORD_0'in p['attributes']for mesh in document['meshes']for p in mesh['primitives']if p.get('material')in wood)
    before=archive.bounds(collection);expected=sum(len(n['index'])//3 for n in original['nodes'])
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(file));meshes=[o for o in bpy.data.objects if o.type=='MESH']
    for obj in meshes:obj.data.calc_loop_triangles()
    triangles=sum(len(obj.data.loop_triangles)for obj in meshes);after=archive.bounds(bpy.context.scene.collection)
    delta=max(abs(before[i][j]-after[i][j])for i in range(2)for j in range(3));assert triangles==expected and delta<1e-5,(family,triangles,expected,delta)
    report={'family':family,'sourceJSONSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'triangles':triangles,'freshBoundsDelta':delta,'parts':len(meshes),'images':len(document.get('images',[])),
      'portableSHA256':hashlib.sha256(raw).hexdigest(),'status':'exported/fresh-imported; actual runtime visual verdict separate'}
    (out/f'{family}-export-report.json').write_text(json.dumps(report,indent=2));print('RAIL_EXPORT '+json.dumps(report))
