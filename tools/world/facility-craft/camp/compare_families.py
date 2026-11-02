"""Compare actual exported families, preserving triangle winding, ignoring face order."""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'docs/world/phase-2-playground/asset-batch5-20261102/camp-revision-r2'

def fingerprints(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+length])
    blob = data[20+length+8:]
    sizes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
    dims = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    def accessor(index, triangles=False):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        start = view.get('byteOffset',0)+a.get('byteOffset',0)
        size = sizes[a['componentType']]*dims[a['type']]
        stride = view.get('byteStride',size)
        raw = b''.join(blob[start+i*stride:start+i*stride+size] for i in range(a['count']))
        if triangles:
            values = [v[0] for v in struct.iter_unpack({5121:'<B',5123:'<H',5125:'<I'}[a['componentType']],raw)]
            # Cyclic rotations preserve winding. Face order in Blender's bmesh
            # export is allowed to change; swapped winding or indices are not.
            oriented = []
            for i in range(0,len(values),3):
                t = tuple(values[i:i+3])
                oriented.append(min(t,t[1:]+t[:1],t[2:]+t[:2]))
            raw = json.dumps(sorted(oriented)).encode()
        return {'componentType':a['componentType'],'type':a['type'],'count':a['count'],
                'normalized':a.get('normalized',False),'sha256':hashlib.sha256(raw).hexdigest()}
    def node(index):
        n = doc['nodes'][index]
        result = {k:n[k] for k in ['name','matrix','translation','rotation','scale','extras'] if k in n}
        result['children'] = [node(i) for i in n.get('children',[])]
        result['primitives'] = []
        if 'mesh' in n:
            for p in doc['meshes'][n['mesh']]['primitives']:
                result['primitives'].append({'attributes':{k:accessor(v) for k,v in p['attributes'].items()},
                    'triangles':accessor(p['indices'],True),'material':doc['materials'][p['material']]})
        return result
    return {name:hashlib.sha256(json.dumps(node(next(i for i,n in enumerate(doc['nodes']) if n.get('name')==name)),sort_keys=True).encode()).hexdigest()
            for name in ['C12','C13','C14','C15','C16']}

before = fingerprints(OUT/'before/camp-facilities-v1.glb')
after = fingerprints(ROOT/'public/assets/world/facility-craft/camp/camp-facilities-v1.glb')
same = {name:before[name]==after[name] for name in before}
assert same == {'C12':True,'C13':False,'C14':True,'C15':True,'C16':True}, same
report = {'scope':'Exact node transforms/extras, attribute bytes and PBR materials; oriented triangle multiset ignores face order only.',
          'before':before,'after':after,'unchanged':same,
          'exportNote':'C12 rubber stand and C14 painted stove index face ordering changed on regeneration; vertex data and oriented triangles are identical.'}
(OUT/'family-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print('Only C13 family geometry/material detail changed; four other families match.')
