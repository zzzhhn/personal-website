"""Fresh import verification and matched offline baseline, source and GLB views."""
from pathlib import Path
import json, math, struct, sys
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'public/assets/world/camp-shelter-craft'
Q=HERE/'qa'

def glb(path):
    raw=path.read_bytes()
    return json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])

def xyz(p):
    return tuple(round(float(a),7) for a in p)

def bounds(items):
    bpy.context.view_layer.update()
    xyzs=[o.matrix_world@v.co for o in items if o.type=='MESH' for v in o.data.vertices]
    return [[min(v[i] for v in xyzs) for i in range(3)],[max(v[i] for v in xyzs) for i in range(3)]]

def near(a,b,tol=2e-6):
    return all(abs(i-j)<tol for i,j in zip(a,b))

def named(g,n):
    return next(o for o in g['nodes'] if o['name']==n)

def pbr(name,rgba,rough):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=rgba;b.inputs['Roughness'].default_value=rough
    return m

def import_asset(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return sorted((o for o in bpy.data.objects if o not in before),key=lambda o:o.name)

def camera(aid):
    if aid=='C04':
        sc.camera.location=(5.1,-6.0,3.42);target=Vector((0,0,1.09));sc.camera.data.lens=55
    else:
        sc.camera.location=(5.3,2.3,2.32);target=Vector((.015,0,1.61));sc.camera.data.lens=48
    sc.camera.rotation_euler=(target-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    return {'position':xyz(sc.camera.location),'target':xyz(target),'lensMm':sc.camera.data.lens}

def render(aid,suffix):
    sc.render.filepath=str(Q/f'{aid}-{suffix}.png')
    bpy.ops.render.render(write_still=True)

bpy.ops.wm.open_mainfile(filepath=str(HERE/'camp-shelter-editable.blend'))
sc=bpy.context.scene
sc.render.resolution_x=740;sc.render.resolution_y=660;sc.cycles.samples=12;sc.cycles.device='CPU'
sc.render.image_settings.file_format='PNG'
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
ground=bpy.context.object;ground.name='Offline ground and contact shadow';ground.data.materials.append(pbr('Neutral matte surface',(.23,.215,.19,1),.93))
clay=pbr('Neutral clay',(.42,.42,.42,1),.80)
report={'scope':'Offline matched views. The game runtime and collider behavior are separate checks.',
        'settings':{'Blender':bpy.app.version_string,'engine':sc.render.engine,'threads':sc.render.threads,
                    'resolution':[sc.render.resolution_x,sc.render.resolution_y],'samples':sc.cycles.samples,
                    'exposure':sc.view_settings.exposure,'viewTransform':sc.view_settings.view_transform},'assets':{}}
selected = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if selected and (Q/'roundtrip.json').exists():
    report['assets'].update(json.loads((Q/'roundtrip.json').read_text())['assets'])
for aid in selected or ('C04','C10'):
    for i in ('C04','C10'):
        bpy.data.collections[f'SOURCE | {i}'].hide_render=i!=aid
    base_path=HERE/f'baseline-{aid}.glb';new_path=OUT/f'{aid}.glb'
    orig,new=glb(base_path),glb(new_path)
    base_root,candidate_root=named(orig,aid),named(new,aid)
    checks={}
    if aid=='C04':
        for k in ('tentParams','doorProfile','collisionVertices','collisionIndices'):
            assert base_root['extras'][k]==candidate_root['extras'][k],k
            checks[k]=True
    else:
        assert base_root['extras']['poleAxisGLB_xz']==candidate_root['extras']['poleAxisGLB_xz']
        for name in base_root['extras']['animatedNodes']:
            a,b=named(orig,name),named(new,name)
            assert near(a['translation'],b['translation']) and a['extras']=={k:b['extras'][k] for k in a['extras']},(a,b)
            checks[name]={'translationGLB':b['translation'],'extrasExact':True}
    view=camera(aid);render(aid,'source')
    bpy.data.collections[f'SOURCE | {aid}'].hide_render=True
    imported=import_asset(new_path)
    meshes=[m for m in imported if m.type=='MESH'];rows=[]
    for o in meshes:
        me=o.data;me.calc_loop_triangles()
        assert me.uv_layers and all(m.use_nodes for m in me.materials),o.name
        rows.append({'name':o.name,'triangles':len(me.loop_triangles),'uvLayers':[u.name for u in me.uv_layers],
                     'materials':[m.name for m in me.materials]})
    assert len(meshes)==sum(len(m['primitives']) for m in new['meshes'])
    candidate_bounds=bounds(imported)
    if aid=='C04':
        assert max(abs(v[0]) for v in candidate_bounds)<=1.7
        assert max(abs(v[1]) for v in candidate_bounds)<=2.2
        assert abs(candidate_bounds[0][2])<.01 and abs(candidate_bounds[1][2]-2.5)<.01
    else:
        assert abs(candidate_bounds[0][2])<.01 and abs(candidate_bounds[1][2]-3.205)<.01
    render(aid,'reimport')
    sc.view_layers[0].material_override=clay
    render(aid,'clay')
    sc.view_layers[0].material_override=None
    for o in imported:o.hide_render=True
    before=import_asset(base_path)
    if not selected or not (Q/f'{aid}-baseline.png').exists():render(aid,'baseline')
    base_bounds=bounds(before)
    for o in before:o.hide_render=True
    report['assets'][aid]={'camera':view,'checks':checks,'reimportedMeshes':rows,
                           'boundsBlenderZUp':{'baseline':base_bounds,'candidate':candidate_bounds}}
    (Q/'roundtrip.json').write_text(json.dumps(report,indent=2)+'\n')
    print('SHELTER_ROUNDTRIP',aid,checks,flush=True)
