"""Batch-6 hut source with fabrication UVs and native editable primitive parts.
Run Blender from repository root, under the shared heavy-job lock.
Runtime GLB shares three external textures through the facility batch shader;
portable GLB embeds the same PBR textures for independent round-trip review.
"""
from pathlib import Path
import sys, importlib.util, json, hashlib, shutil, math
import bpy, bmesh

ROOT = Path.cwd()
OUT = ROOT / 'public/assets/world/craft-batch6-facilities'
NATIVE = ROOT / 'tools/world/facility-craft/batch6/native'
OUT.mkdir(parents=True, exist_ok=True)
NATIVE.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tools/world/park'))
import parklib as lib

records = []
OriginalPart = lib.Part
class CraftPart(OriginalPart):
    def add(self, src, mat, xform=None, smooth=None):
        lib.orient_outward(src)
        if xform is not None:
            bmesh.ops.transform(src, matrix=xform, verts=src.verts)
        lo = [min(v.co[i] for v in src.verts) for i in range(3)]
        hi = [max(v.co[i] for v in src.verts) for i in range(3)]
        axis = max(range(3), key=lambda i: hi[i]-lo[i])
        uv = src.loops.layers.uv.verify()
        for face in src.faces:
            face.normal_update()
            other = max((i for i in range(3) if i != axis), key=lambda i: (hi[i]-lo[i]) * (1-abs(face.normal[i])))
            for loop in face.loops:
                loop[uv].uv = (loop.vert.co[axis]/2.4 + len(records)*.137, loop.vert.co[other]/.24)
        records.append((self.name, mat, src.copy(), self.smooth if smooth is None else smooth))
        return super().add(src, mat, smooth=smooth)
lib.Part = CraftPart
spec = importlib.util.spec_from_file_location('hut_base', ROOT / 'tools/world/park/build_huts.py')
hut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hut)
lib.reset_scene()
roots = []
for variant, width in hut.VARIANTS.items():
    first = len(records)
    root, old_objects = hut.build(variant, width)
    roots.append(root)
    for obj in old_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    # A layered, proud eave and recessed underside read without adding bolts.
    part = CraftPart('shell_'+variant)
    hw, y = width/2, hut.Y0-.55
    part.add(lib.box((-hw-.29,y-.078,hut.h(y)-.16), (hw+.29,y-.045,hut.h(y)+.06), bevel=.012), 'park_wood_mid')
    part.add(lib.box((-hw-.29,y-.09,hut.h(y)+.06), (hw+.29,y-.04,hut.h(y)+.15), bevel=.008), 'park_roof_slate')
    part.bm.free()
    for index, (group, mat, bm, smooth) in enumerate(records[first:]):
        mesh = bpy.data.meshes.new(f'{group}.part-{index:03d}')
        bm.to_mesh(mesh); bm.free()
        mesh.materials.append(lib.get_mat(mat))
        for polygon in mesh.polygons: polygon.use_smooth = smooth
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(obj); obj.parent = root

texture_names = [('pine-packaging-basecolor.png','wood-color.png'),('pine-packaging-normal.png','wood-normal.png'),('pine-packaging-roughness.png','wood-rough.png')]
for source, target in texture_names:
    shutil.copyfile(ROOT/'tools/world/ibd-crate-craft/textures'/source, OUT/target)
images = {}
for _, filename in texture_names:
    image = bpy.data.images.load(str(OUT/filename), check_existing=True)
    image.colorspace_settings.name = 'sRGB' if filename == 'wood-color.png' else 'Non-Color'
    image.pack(); images[filename] = image
for material in bpy.data.materials:
    if not material.use_nodes: continue
    p = material.node_tree.nodes.get('Principled BSDF')
    if not p: continue
    if 'wood' in material.name:
        old = list(p.inputs['Base Color'].default_value)
        # Keep the project pigment while the shared scan supplies its grain.
        factor = [old[i]/[.604,.407,.196][i] for i in range(3)]
        color = material.node_tree.nodes.new('ShaderNodeTexImage'); color.image = images['wood-color.png']
        multiply = material.node_tree.nodes.new('ShaderNodeMixRGB'); multiply.blend_type='MULTIPLY'
        multiply.inputs[0].default_value=1; multiply.inputs[2].default_value=(*factor,1)
        material.node_tree.links.new(color.outputs['Color'],multiply.inputs[1])
        material.node_tree.links.new(multiply.outputs[0],p.inputs['Base Color'])
        rough = material.node_tree.nodes.new('ShaderNodeTexImage'); rough.image=images['wood-rough.png']
        material.node_tree.links.new(rough.outputs['Color'],p.inputs['Roughness'])
        normal = material.node_tree.nodes.new('ShaderNodeTexImage'); normal.image=images['wood-normal.png']
        bump = material.node_tree.nodes.new('ShaderNodeNormalMap'); bump.inputs['Strength'].default_value=.24
        material.node_tree.links.new(normal.outputs['Color'],bump.inputs['Color'])
        material.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    elif 'roof' in material.name: p.inputs['Roughness'].default_value=.38; p.inputs['Metallic'].default_value=.24
    elif 'paint' in material.name: p.inputs['Roughness'].default_value=.43; p.inputs['Metallic'].default_value=.08
    elif 'iron' in material.name or 'brass' in material.name: p.inputs['Roughness'].default_value=.3; p.inputs['Metallic'].default_value=.72

bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE/'huts.blend'),compress=True)
def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive: child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/name),export_format='GLB',use_selection=True,
        export_yup=True,export_normals=True,export_texcoords=True,export_cameras=False,export_lights=False,export_animations=False,export_extras=True)
export('hut-portable.glb')
# Web batches borrow external shared maps; no second embedded image residency.
for material in bpy.data.materials:
    if not material.use_nodes: continue
    p=material.node_tree.nodes.get('Principled BSDF')
    if not p: continue
    for name in ['Base Color','Roughness','Normal']:
        for link in list(p.inputs[name].links): material.node_tree.links.remove(link)
export('hut-runtime.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'hut-portable.glb'))
report={'roots':{},'runtimeBytes':(OUT/'hut-runtime.glb').stat().st_size,'portableBytes':(OUT/'hut-portable.glb').stat().st_size}
for root in [o for o in bpy.data.objects if o.name.startswith('hut_') and o.type=='EMPTY']:
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    for o in meshes: o.data.calc_loop_triangles()
    report['roots'][root.name]={'triangles':sum(len(o.data.loop_triangles) for o in meshes),'parts':len(meshes),'allUv':all(len(o.data.uv_layers)>0 for o in meshes)}
report['hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir() if p.is_file()}
(OUT/'hut-export-report.json').write_text(json.dumps(report,indent=2))
print('BATCH6_HUT_REPORT '+json.dumps(report))
