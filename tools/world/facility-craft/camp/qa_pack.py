"""Pure-Python fresh GLB validation: actual positions, bounds, material classes and frozen pivot.
No Blender or browser. Requires build_camp.py to have created the candidate first.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--out-root',type=Path,default=HERE.parents[3])
opts=parser.parse_args()
root=opts.out_root.resolve(); path=root/'public/assets/world/facility-craft/camp/camp-facilities-v1.glb'
blob=path.read_bytes(); magic,version,total=struct.unpack_from('<4sII',blob,0)
assert magic==b'glTF' and version==2 and total==len(blob)
length,kind=struct.unpack_from('<I4s',blob,12); assert kind==b'JSON'
gltf=json.loads(blob[20:20+length]); offset=20+length
bin_length,kind=struct.unpack_from('<I4s',blob,offset); assert kind==b'BIN\x00'
binary=blob[offset+8:offset+8+bin_length]
assert not gltf.get('images'), 'This authored construction pass needs no external images'
assert not gltf.get('cameras') and not gltf.get('animations')
assert 'KHR_lights_punctual' not in gltf.get('extensionsUsed',[])
assert 'KHR_materials_transmission' not in gltf.get('extensionsUsed',[])
manifest=json.loads((path.parent/'manifest.json').read_text())
contract=json.loads((HERE/'baseline-contract.json').read_text())


def multiply(a,b):
    return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def matrix(node):
    if 'matrix' in node: return [[node['matrix'][j*4+i] for j in range(4)] for i in range(4)]
    x,y,z,w=node.get('rotation',[0,0,0,1]); sx,sy,sz=node.get('scale',[1,1,1]); tx,ty,tz=node.get('translation',[0,0,0])
    return [[(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx],
            [(2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty],
            [(2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz],[0,0,0,1]]


def positions(accessor_index):
    accessor=gltf['accessors'][accessor_index]
    assert accessor['componentType']==5126 and accessor['type']=='VEC3'
    view=gltf['bufferViews'][accessor['bufferView']]; offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
    stride=view.get('byteStride',12)
    for i in range(accessor['count']): yield struct.unpack_from('<fff',binary,offset+i*stride)


def measure(index,parent):
    node=gltf['nodes'][index]; world=multiply(parent,matrix(node)); points=[]; triangles=0; mats=set(); nodes=[node.get('name','')]
    if 'mesh' in node:
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode',4)==4
            for xyz in positions(primitive['attributes']['POSITION']):
                point=[sum(world[i][j]*xyz[j] for j in range(3))+world[i][3] for i in range(3)]
                assert all(math.isfinite(value) for value in point)
                points.append(point)
            triangles+=(gltf['accessors'][primitive['indices']]['count'] if 'indices' in primitive else gltf['accessors'][primitive['attributes']['POSITION']]['count'])//3
            mats.add(gltf['materials'][primitive['material']]['name'])
    for child in node.get('children',[]):
        more,count,materials,names=measure(child,world); points.extend(more); triangles+=count; mats.update(materials); nodes.extend(names)
    return points,triangles,mats,nodes


identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
native=root/'tools/world/facility-craft/camp/source/camp-facilities-source.blend'
native_blob=native.read_bytes()
report={'glbSha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'images':0,
        'native':{'path':str(native.relative_to(root)),'bytes':len(native_blob),'sha256':hashlib.sha256(native_blob).hexdigest()},'families':{}}
assert report['glbSha256']==manifest['glb']['sha256']
for aid in ['C12','C13','C14','C15','C16']:
    index=next(i for i,node in enumerate(gltf['nodes']) if node.get('name')==aid)
    points,triangles,mats,nodes=measure(index,identity)
    low=[min(p[i] for p in points) for i in range(3)]; high=[max(p[i] for p in points) for i in range(3)]
    dimensions=[high[i]-low[i] for i in range(3)]
    expected=manifest['families'][aid]
    assert triangles==expected['triangles'],(aid,triangles,expected['triangles'])
    assert max(abs(a-b) for a,b in zip(dimensions,expected['dimensionsGLB']))<2e-5,(aid,dimensions,expected['dimensionsGLB'])
    assert set(expected['materials'])==mats
    assert set(expected['meshNodes']).issubset(nodes), (aid,'node contract')
    report['families'][aid]={'triangles':triangles,'dimensionsGLB':dimensions,'minGLB':low,'maxGLB':high,'materialCount':len(mats),'meshNodeCount':len(nodes)}
old_wok=next(n for n in contract['assets']['C14']['nodes'] if n['name']=='C14_wok')['translation']
new_wok=next(n for n in gltf['nodes'] if n.get('name')=='C14_wok').get('translation',[0,0,0])
assert max(abs(a-b) for a,b in zip(old_wok,new_wok))<1e-6,('wok pivot drift',old_wok,new_wok)
report['wokPivotGLB']=new_wok
report['status']='numerical export checks passed; visual/runtime/interaction approval remains separate'
(path.parent/'qa-pack.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
