"""Add bounded portable-asset inventory and review provenance to Blender manifest."""
import json,hashlib,io
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'docs/world/phase-2-playground/ibd-crate-craft-20261101'
path=OUT/'manifest.json';info=json.loads(path.read_text());blob=(OUT/'crate.glb').read_bytes()
jsonlen=int.from_bytes(blob[12:16],'little');gltf=json.loads(blob[20:20+jsonlen]);binstart=20+jsonlen+8
images=[]
for im in gltf.get('images',[]):
    view=gltf['bufferViews'][im['bufferView']];start=binstart+view.get('byteOffset',0);payload=blob[start:start+view['byteLength']]
    image=Image.open(io.BytesIO(payload));images.append(dict(name=im.get('name'),size=list(image.size),mime=im['mimeType'],bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest()))
info['images_embedded']=images
info['primitives']=sum(len(mesh['primitives']) for mesh in gltf['meshes'])
info['material_count']=len(gltf['materials'])
info['source_scripts']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.iterdir() if p.name in ['build.py','capture-baseline.mjs','prepare-textures.py','run.py','finalize-manifest.py']}
info['commands']=['node tools/world/ibd-crate-craft/capture-baseline.mjs','python3 tools/world/ibd-crate-craft/prepare-textures.py','python3 tools/world/ibd-crate-craft/run.py preview','python3 tools/world/ibd-crate-craft/run.py finish']
info['root_matrices_three']={n:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] for n in ['Shell','Lid']}
info['hinge']={'runtime_pivot_three':[0,1.08,-1.25],'production_rotation_x_closed_open':[0,-2],
 'native_transform':'p(x,y,z)=(x,-z,y); X rotations keep their sign.',
 'fresh_import_rotation':'Root rotation_mode is explicitly XYZ before applying production -2.'}
info['open_rig']={'camera_three':[5.8,4.4,7],'target_three':[0,1.2,0],'ortho_scale':7.5,'reason':'Entire production -2 lid is visible; closed day/night comparisons retain their matched rig.'}
info['review']={'inspected_final_images':['crate-fresh-closed.png','crate-fresh-close.png','crate-fresh-open.png','crate-fresh-night.png','crate-ao-only-fresh.png'],
 'inspected_native_images':['crate-before.png','crate-after.png','crate-clay.png','crate-open-native.png','crate-before-night.png','crate-after-night.png'],
 'repairs':['Scanned pine field cropped between photographed board joints; each mesh board samples a real board segment.','Low contrast irregular endgrain replaces repeated target-like rings.','Frame post and rail visible surfaces separated by a real lap; through axle terminates inside forks so caps exclusively own exposed ends.','150 pre-repair native components had positive signed volume and zero nonmanifold edges; visible black patches were traced to equal-distance coplanar surfaces.','UV1 uses zero-margin projection followed by explicit 3px packing; final occupied UV area .5672.','Rubber excluded from baked AO after an isolated tire UV fragment was found; original rubber PBR and runtime shadows retained.'],
 'acceptance':'Offline source/fresh-import visual inspection completed by crate_craft. Parent preview direction review completed. Browser/runtime visuals, performance and end-user acceptance are separate primary-owned checks.'}
path.write_text(json.dumps(info,indent=2));print(json.dumps(dict(bytes=info['glb_bytes'],triangles=sum(v['triangles'] for v in info['fresh'].values()),materials=info['material_count'],primitives=info['primitives'],images=images,sha256=info['hashes']['crate.glb'])))
