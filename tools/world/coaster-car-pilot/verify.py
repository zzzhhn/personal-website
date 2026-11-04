"""Bounded portable GLB checks. This does not claim visual or ride acceptance."""
import json,struct,math,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[3]
out=root/'docs/world/phase-2-playground/coaster-car-astra-pilot-20261104'
b=(out/'coaster-car.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);data=b[28+n:]
fmt={5126:'f',5125:'I',5123:'H',5121:'B'};width={'VEC3':3,'VEC2':2,'VEC4':4,'SCALAR':1}
def array(index):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];f='<'+fmt[a['componentType']]*width[a['type']];size=struct.calcsize(f);start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from(f,data,start+i*v.get('byteStride',size)) for i in range(a['count'])]
minimum=[math.inf]*3;maximum=[-math.inf]*3;triangles=0;degen=0;normal_error=0
for mesh in g['meshes']:
 for p in mesh['primitives']:
  positions=array(p['attributes']['POSITION']);normals=array(p['attributes']['NORMAL']);uv=array(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else []
  ids=[v[0] for v in array(p['indices'])];triangles+=len(ids)//3
  assert all(math.isfinite(c) for a in positions+normals+uv for c in a)
  assert all(0<=i<len(positions) for i in ids)
  for xyz in positions:
   for k in range(3):minimum[k]=min(minimum[k],xyz[k]);maximum[k]=max(maximum[k],xyz[k])
  for a in normals:normal_error=max(normal_error,abs(sum(x*x for x in a)-1))
  for i in range(0,len(ids),3):
   a,b1,c=[positions[j] for j in ids[i:i+3]];u=[b1[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
   area=sum(t*t for t in [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]])
   if area<1e-22:degen+=1
assert normal_error<.001,normal_error
assert degen==0,degen
assert len(g['meshes'])==8
assert len(g['images'])==3
assert 'KHR_materials_clearcoat' in g['extensionsUsed']
# Exported vertices are already Y-up; no mutable car transform is baked into them.
assert minimum[1]>=-.181 and maximum[1]<=1.476
assert minimum[2]>=-1.009 and maximum[2]<=1.009
assert minimum[0]>=-1.451 and maximum[0]<=1.486 # .011 m badge emboss on nose
report={'triangles':triangles,'drawsPerCar':len(g['meshes']),'min':minimum,'max':maximum,'degenerateTriangles':degen,'maximumNormalLengthSquaredError':normal_error,'embeddedImages':len(g['images']),'clearcoatPortable':True,'glbSha256':hashlib.sha256(b).hexdigest(),'scope':'finite indexed geometry, UVs, material export and frozen outer envelope; no visual/performance/ride acceptance implied'}
(out/'export-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
