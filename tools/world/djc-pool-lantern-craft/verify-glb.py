"""Independent bounded glTF binary and contract check; no Blender dependency."""
import json,hashlib,struct
from pathlib import Path

tools=Path(__file__).resolve().parent
out=tools.parents[2]/'docs/world/phase-2-playground/djc-pool-lantern-craft-20261101'
path=out/'pool-lantern-v1.glb';blob=path.read_bytes()
magic,version,total=struct.unpack_from('<III',blob)
assert magic==0x46546c67 and version==2 and total==len(blob)
length,kind=struct.unpack_from('<II',blob,12);assert kind==0x4e4f534a
gltf=json.loads(blob[20:20+length]);primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']]
assert len(primitives)==4 and len(gltf['materials'])==4
assert all('TEXCOORD_0' in p['attributes'] and 'TEXCOORD_1' in p['attributes'] for p in primitives)
assert all(m['occlusionTexture'].get('texCoord',0)==1 for m in gltf['materials'])
assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in gltf['materials'])
assert not {'KHR_materials_transmission','KHR_lights_punctual'}.intersection(gltf.get('extensionsUsed',[]))
diffuser=next(m for m in gltf['materials'] if m.get('extras',{}).get('djcRole')=='emissive-diffuser')
assert diffuser['extras']['dayEmissiveIntensity']==0 and diffuser['extras']['nightEmissiveIntensity']==1.4
triangle_count=sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives)
assert triangle_count==11304
images=[dict(name=im.get('name',''),mime_type=im['mimeType'],embedded_bytes=gltf['bufferViews'][im['bufferView']]['byteLength']) for im in gltf.get('images',[])]
assert all(im['embedded_bytes']>0 for im in images)
report=dict(sha256=hashlib.sha256(blob).hexdigest(),glb_bytes=len(blob),triangles=triangle_count,meshes=len(gltf['meshes']),primitives=len(primitives),materials=len(gltf['materials']),images=images,image_bytes=sum(im['embedded_bytes'] for im in images),uv0='All 4 primitives',uv1='All 4 primitives; AO only',exported_lights=0,opaque=True,source_collision='Untouched by asset-only files')
(out/'glb-contract-validation.json').write_text(json.dumps(report,indent=2)+'\n')
manifest=json.loads((out/'manifest.json').read_text());manifest['binary_contract']=report
manifest['texture_sources']=json.loads((out/'texture-sources.json').read_text())
manifest['scripts']['verify-glb.py']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('sha256','glb_bytes','triangles','primitives','materials','image_bytes')}))
