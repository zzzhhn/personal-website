"""Lightweight baseline inventory, with explicit --write only for the first frozen receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import struct

HERE=Path(__file__).resolve().parent
IDS=['C12','C13','C14','C15','C16']
parser=argparse.ArgumentParser()
parser.add_argument('--base-root',type=Path,default=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release'))
parser.add_argument('--write',action='store_true')
opts=parser.parse_args()
files={}; assets={}
paths=['tools/world/camp-content/build_assets.py','tools/world/camp-content/cc_lib.py','tools/world/camp/props/build_props.py',
       'src/components/world/WorldCampContent.tsx','src/components/world/WorldCampContentLayout.ts']
for aid in IDS:
    paths.extend([f'public/assets/world/camp/{aid}.glb',f'tools/world/camp-content/blend/{aid}.blend'])
for path in paths:
    blob=(opts.base_root/path).read_bytes(); files[path]=hashlib.sha256(blob).hexdigest()
    if not path.endswith('.glb'): continue
    length=struct.unpack_from('<I',blob,12)[0]; gltf=json.loads(blob[20:20+length])
    root=next(node for node in gltf['nodes'] if node.get('name') in IDS)
    assets[root['name']]={'bytes':len(blob),'sha256':files[path],
        'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives']),
        'materials':len(gltf.get('materials',[])), 'images':len(gltf.get('images',[])),
        'dimensionsGLB':root['extras']['designBoundsGLB_xyz'],
        'nodes':[{k:n[k] for k in ['name','translation','rotation','scale','matrix'] if k in n} for n in gltf['nodes']]}
receipt={'baselineRevision':'2f22560fff2174195d8ce70b855ae4b871a388a7','baseRoot':str(opts.base_root.resolve()),'files':files,'assets':assets,
    'physics':'All fixed trimeshes/hulls continue to derive from original /assets/world/camp GLBs, never the candidate pack.',
    'motion':{'C12':'strings local X +/- .003 * sin(t*140); whole local X rotation .02*sin(t*22)',
              'C13':'local X rotation .16*sin(t*8), original 1.7 scale, two 16 kg bodies',
              'C14':'wok node frame is ORIGINAL GLB pivot; local Y +.09*sin(pi*t/.6), local Z .12*sin(t*9)',
              'C15':'whole local Y +.05*abs(sin(pi*min(t,.9)/.45)); no lid hinge exists in actual baseline',
              'C16':'desk local [-.4,.85,-.62], original warm light pools; no collider or new light'}}
target=HERE/'baseline-contract.json'
if opts.write:
    if target.exists(): raise SystemExit('Frozen contract exists; use check mode, do not overwrite provenance')
    target.write_text(json.dumps(receipt,indent=2)+'\n')
else:
    frozen=json.loads(target.read_text())
    assert receipt==frozen, 'Baseline contract drift'
print(json.dumps({'baselineCheck':'written' if opts.write else 'pass','files':len(files),'assets':assets},indent=2))
