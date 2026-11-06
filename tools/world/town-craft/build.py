"""Refine original town assets, retain gameplay contracts and author real UVs.
Blender: --background --threads 2 --python tools/world/town-craft/build.py -- REPO T03
"""
import sys, os, json, hashlib, copy
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'town')); sys.path.insert(0,str(HERE))
import bpy, bmesh
import build_town as base
from townlib import finalize, reset_scene, DRACO, MATS
MATS['town_canvas_blue']=('#4E647D',.90,0.0,None)
from refine_architecture import refine as architecture
try:
    from refine_coastal import refine as coastal
except ImportError:
    coastal=lambda A:A

FAMILIES={'town_stone':'stone','town_stone_dark':'stone','town_trim':'stone','town_cream':'plaster','town_sand':'plaster','town_brick':'brick','town_wood':'wood','palm_trunk':'bark','town_metal':'metal','town_slate':'metal','town_dark':'metal','town_roof':'roof','town_canvas':'cloth','town_canvas_cream':'cloth','town_canvas_blue':'cloth','town_glass_lit':'glazing'}

def contract(A):
    return copy.deepcopy({'cols':[(name,sorted(tuple(round(float(c),7) for c in v.co) for v in bm.verts)) for name,bm in A.cols], 'anchors':[(name,list(loc),extras) for name,loc,extras in A.anchors],'extras':A.extras,'partExtras':A.part_extras,'shadowTops':A.shadow_tops})

def uv_project(A):
    for name,(bm,slots) in A.parts.items():
        uv=bm.loops.layers.uv.new('UVMap')
        bm.normal_update()
        # Connected primitive islands define timber grain direction; it follows
        # the member's long axis, not a global world direction across all wood.
        seen=set()
        for seed in list(bm.verts):
            if seed in seen:continue
            verts=[]; todo=[seed]; seen.add(seed)
            while todo:
                v=todo.pop(); verts.append(v)
                for e in v.link_edges:
                    other=e.other_vert(v)
                    if other not in seen:seen.add(other);todo.append(other)
            bounds=[max(v.co[i] for v in verts)-min(v.co[i] for v in verts) for i in range(3)]
            long=max(range(3),key=lambda i:bounds[i])
            for f in {f for v in verts for f in v.link_faces}:
                dominant=max(range(3),key=lambda i:abs(f.normal[i]))
                axes=[i for i in range(3) if i!=dominant]
                if slots[f.material_index] in ('town_wood','palm_trunk') and long in axes:
                    axes=[i for i in axes if i!=long]+[long]
                for loop in f.loops:
                    if slots[f.material_index]=='town_glass_lit':
                        loop[uv].uv=tuple((loop.vert.co[i]-min(v.co[i] for v in verts))/max(bounds[i],.001) for i in axes)
                    else:loop[uv].uv=(loop.vert.co[axes[0]]/2,loop.vert.co[axes[1]]/2)

def source_materials(objs,repo):
    # Runtime loads the same shared tiles once. Keep them packed in the native
    # sources, but do not duplicate the images inside every shipped GLB.
    used={m for o in objs if o.type=='MESH' for m in o.data.materials if m}
    for m in used:
        family=FAMILIES.get(m.name)
        if not family:continue
        nodes=m.node_tree.nodes; links=m.node_tree.links; bsdf=nodes.get('Principled BSDF')
        tint=tuple(bsdf.inputs['Base Color'].default_value)
        tex={}
        for kind in ('color','normal','orm'):
            image=bpy.data.images.load(str(repo/'public/assets/world/town-craft/surfaces'/f'{family}-{kind}.png'),check_existing=True)
            image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color'; image.pack()
            n=nodes.new('ShaderNodeTexImage');n.image=image;n.extension='REPEAT';tex[kind]=n
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[1].default_value=tint
        links.new(tex['color'].outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
        if family=='glazing':
            emission=nodes.new('ShaderNodeMixRGB');emission.blend_type='MULTIPLY';emission.inputs[0].default_value=1;emission.inputs[1].default_value=tuple(bsdf.inputs['Emission Color'].default_value)
            links.new(tex['color'].outputs['Color'],emission.inputs[2]);links.new(emission.outputs[0],bsdf.inputs['Emission Color'])
        n=nodes.new('ShaderNodeNormalMap');links.new(tex['normal'].outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
        sep=nodes.new('ShaderNodeSeparateColor');links.new(tex['orm'].outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bsdf.inputs['Roughness'])
        if m.name=='town_dark':
            for link in list(bsdf.inputs['Roughness'].links):links.remove(link)
            bsdf.inputs['Roughness'].default_value=.78

def run(repo,ids):
    report={}
    glbdir=repo/'public/assets/world/town-craft';native=HERE/'native';glbdir.mkdir(parents=True,exist_ok=True);native.mkdir(exist_ok=True)
    for aid in ids:
        reset_scene();A=base.BUILDERS[aid]();before=contract(A)
        architecture(A);coastal(A)
        assert contract(A)==before, f'{aid} gameplay contract changed'
        uv_project(A);objs,lo,hi=finalize(A)
        for m in bpy.data.materials:
            if m.name=='town_metal':m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.78
            if m.name=='town_slate':m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.3
            if m.name.startswith('town_glass'):
                m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.23
            if m.name in FAMILIES:m['craftFamily']=FAMILIES[m.name]
        objs[0]['generator']='town-craft-20261107';objs[0]['contractHash']=hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest()
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        glb=glbdir/f'{aid}.glb'
        bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_normals=True,export_materials='EXPORT',export_texcoords=True,export_tangents=False,export_vertex_color='NONE',export_all_vertex_colors=False,export_cameras=False,export_lights=False,export_animations=False,export_extras=True,export_attributes=True,**DRACO)
        source_materials(objs,repo)
        for o in objs:
            if o.name.startswith('col_'):o.hide_render=True
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(native/f'{aid}.blend'),compress=True)
        tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objs if o.type=='MESH' and not o.name.startswith('col_'))
        report[aid]={'triangles':tris,'bytes':glb.stat().st_size,'bounds':[list(lo),list(hi)],'colliders':len(A.cols),'contractHash':objs[0]['contractHash'],'uv':True}
        print('[craft]',aid,json.dumps(report[aid]),flush=True)
    manifest=glbdir/'manifest.json';prior=json.loads(manifest.read_text()) if manifest.exists() else {}
    prior.update(report);manifest.write_text(json.dumps(prior,indent=2)+'\n')

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];run(Path(args[0]).resolve(),args[1:] or sorted(base.BUILDERS))
