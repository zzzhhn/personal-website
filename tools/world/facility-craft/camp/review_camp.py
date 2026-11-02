"""Matched baseline/native/fresh GLB review rig, including clay and nonzero motion.

Blender -b --factory-startup -P review_camp.py -- --out-root <checkout> --families C12 C16
Render jobs are coordinator-only and serialized. Default renders 512 px overview and clay for
all five families. --views overview close grazing --states rest motion can expose construction.
Every mode shares frozen camera/light/exposure per family/view/state. No browser claims.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--base-root',type=Path,default=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release'))
parser.add_argument('--out-root',type=Path,default=HERE.parents[3])
parser.add_argument('--families',nargs='+',default=['C12','C13','C14','C15','C16'])
parser.add_argument('--modes',nargs='+',default=['baseline','native','fresh'])
parser.add_argument('--views',nargs='+',default=['overview','clay'])
parser.add_argument('--states',nargs='+',default=['rest'])
parser.add_argument('--resolution',type=int,default=512)
parser.add_argument('--receipt-only',action='store_true',help='Recover deterministic rig metadata for existing images without loading assets or rendering; label the recovery explicitly')
opts=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
out=opts.out_root.resolve(); base=opts.base_root.resolve()
if out==base or base in out.parents: raise RuntimeError('Review output cannot use the baseline checkout')
review=out/'docs/world/phase-2-playground/asset-batch5-20261102/camp-review'
review.mkdir(parents=True,exist_ok=True)
contract=json.loads((HERE/'baseline-contract.json').read_text())
manifest=json.loads((out/'public/assets/world/facility-craft/camp/manifest.json').read_text())
rigs={}
hashes={}
ENGINE=None
for candidate in ['BLENDER_EEVEE','BLENDER_EEVEE_NEXT','CYCLES']:
    try:
        bpy.context.scene.render.engine=candidate
        ENGINE=candidate
        break
    except (TypeError,ValueError):
        continue
if ENGINE is None: raise RuntimeError('No supported Eevee or Cycles renderer')


def file_receipt(path):
    path=path.resolve()
    if path not in hashes:
        blob=path.read_bytes()
        hashes[path]={'path':str(path),'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
    return hashes[path]


def merge_rig_receipt(path,key,receipt):
    """Checkpoint each completed image, preserving unrelated rigs and prior modes of this rig."""
    existing=json.loads(path.read_text()) if path.exists() else {}
    previous=existing.get(key,{})
    renders={**previous.get('renders',{}),**receipt.get('renders',{})}
    existing[key]={**previous,**receipt,'renders':renders}
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(existing,indent=2)+'\n')
    temporary.replace(path)


def load(mode,aid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if mode=='native':
        bpy.ops.wm.open_mainfile(filepath=str(out/'tools/world/facility-craft/camp/source/camp-facilities-source.blend'))
        baseline=bpy.data.collections.get('BASELINE_NATIVE_READ_ONLY_COPY')
        if baseline: bpy.data.collections.remove(baseline)
        runtime=bpy.data.collections['CRAFT_ASSETS']; runtime.hide_render=False; runtime.hide_viewport=False
    else:
        filename=base/'public/assets/world/camp'/f'{aid}.glb' if mode=='baseline' else out/'public/assets/world/facility-craft/camp/camp-facilities-v1.glb'
        bpy.ops.import_scene.gltf(filepath=str(filename))
    family=bpy.data.objects.get(aid)
    if not family: raise RuntimeError(f'{mode} missing family {aid}')
    keep={family,*family.children_recursive}
    for ob in list(bpy.data.objects):
        if ob not in keep: bpy.data.objects.remove(ob,do_unlink=True)
    bpy.context.view_layer.update()
    return bpy.data.objects[aid]


def apply_motion(root,aid):
    # Conversion (x,-z,y) preserves Y-up local-Z motion as Blender local-Y with the sign below.
    # t=.18 s uses the actual WorldCampContent nonzero amplitudes, including the same decay.
    t=.18; decay=1-t/1.8
    if aid=='C14':
        wok=next(ob for ob in root.children_recursive if ob.name=='C14_wok')
        wok.location.z+=.09*math.sin(math.pi*t/.6)
        wok.rotation_euler.y=-.12*math.sin(t*9)*decay
    if aid=='C12':
        root.rotation_euler.x=.02*math.sin(t*22)*decay
        strings=next(ob for ob in root.children_recursive if ob.name=='C12_strings')
        strings.location.x+=.003*math.sin(t*140)*decay
    if aid=='C13': root.rotation_euler.x=.16*math.sin(t*8)*decay
    if aid=='C15': root.location.z+=.05*abs(math.sin(math.pi*min(t,.9)/.45))


def rig(aid,view):
    size=contract['assets'][aid]['dimensionsGLB']
    fresh=manifest['families'][aid]['dimensionsGLB']
    h=max(size[1],fresh[1]); radius=max(size+fresh)
    target=Vector((0,0,size[1]*.5))
    direction=Vector((1,-1,.65)).normalized()
    ortho=radius*1.40
    if view=='grazing': direction=Vector((1,-1,.12)).normalized()
    if view=='close':
        target=Vector({'C12':(.02,0,.60),'C13':(0,0,.06),'C14':(0,0,.35),'C15':(0,.16,.55),'C16':(0,0,.17)}[aid])
        ortho=radius*.65
    return {'position':list(target+direction*max(3,radius*4)),'target':list(target),'orthoScale':ortho,
            'resolution':opts.resolution,'exposure':0,'worldStrength':.55,'keyEnergy':2.6,'fillEnergy':.8,
            'viewTransform':'Standard','look':'None','engine':ENGINE,'samples':32}


def setup(r):
    scene=bpy.context.scene; scene.render.engine=r['engine']
    if r['engine']=='CYCLES': scene.cycles.samples=r['samples']
    scene.render.resolution_x=scene.render.resolution_y=r['resolution']; scene.render.resolution_percentage=100
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'; scene.view_settings.exposure=0
    world=bpy.data.worlds.new('camp-review-neutral'); world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.62,.62,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=r['worldStrength']; scene.world=world
    for name,energy,angle in [('key',2.6,35),('fill',.8,215)]:
        light=bpy.data.lights.new(name,'SUN'); light.energy=energy; light.angle=math.radians(8)
        ob=bpy.data.objects.new(name,light); scene.collection.objects.link(ob)
        ob.rotation_euler=(math.radians(50),0,math.radians(angle))
    bpy.ops.mesh.primitive_plane_add(size=12,location=(0,0,-.001))
    floor=bpy.context.object; floor.name='REVIEW_ONLY_floor'
    material=bpy.data.materials.new('REVIEW_ONLY_floor'); material.diffuse_color=(.33,.33,.33,1); material.use_nodes=True
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.33,.33,.33,1)
    material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95
    floor.data.materials.append(material)
    camera_data=bpy.data.cameras.new('REVIEW_ONLY_camera'); camera_data.type='ORTHO'; camera_data.ortho_scale=r['orthoScale']
    camera=bpy.data.objects.new('REVIEW_ONLY_camera',camera_data); scene.collection.objects.link(camera)
    camera.location=r['position']; camera.rotation_euler=(Vector(r['target'])-camera.location).to_track_quat('-Z','Y').to_euler(); scene.camera=camera
    return scene


for aid in opts.families:
    for state in opts.states:
        for view in opts.views:
            key=f'{aid}_{state}_{view}'; r=rig(aid,view); rigs[key]=r
            for mode in opts.modes:
                input_path=(base/'public/assets/world/camp'/f'{aid}.glb' if mode=='baseline' else
                            out/'tools/world/facility-craft/camp/source/camp-facilities-source.blend' if mode=='native' else
                            out/'public/assets/world/facility-craft/camp/camp-facilities-v1.glb')
                image=review/f'{key}_{mode}.png'
                if not opts.receipt_only:
                    root=load(mode,aid)
                    if state=='motion': apply_motion(root,aid)
                if not opts.receipt_only and view=='clay':
                    clay=bpy.data.materials.new('REVIEW_ONLY_clay'); clay.use_nodes=True
                    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.48,.48,.48,1)
                    clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
                    for ob in [root]+list(root.children_recursive):
                        if ob.type=='MESH':
                            ob.data.materials.clear(); ob.data.materials.append(clay)
                            for polygon in ob.data.polygons: polygon.material_index=0
                if not opts.receipt_only:
                    scene=setup(r)
                    scene.render.filepath=str(image)
                    bpy.ops.render.render(write_still=True)
                    actual_engine=scene.render.engine
                else:
                    if not image.exists(): raise RuntimeError(f'Cannot recover missing image receipt: {image}')
                    actual_engine=ENGINE
                status='recovered-from-deterministic-rig-and-existing-image' if opts.receipt_only else 'captured-after-successful-render'
                receipt={**r,'engine':actual_engine,'blenderVersion':bpy.app.version_string,
                         'reviewScript':file_receipt(Path(__file__)),
                         'sourceNative':file_receipt(out/'tools/world/facility-craft/camp/source/camp-facilities-source.blend'),
                         'freshGLB':file_receipt(out/'public/assets/world/facility-craft/camp/camp-facilities-v1.glb'),
                         'baselineGLB':file_receipt(base/'public/assets/world/camp'/f'{aid}.glb'),
                         'renders':{mode:{'status':status,'engine':actual_engine,'blenderVersion':bpy.app.version_string,
                                          'input':file_receipt(input_path),'image':file_receipt(image)}}}
                merge_rig_receipt(review/'rigs.json',key,receipt)
print(json.dumps({'reviewDirectory':str(review),'rigCount':len(rigs),'modes':opts.modes}))
