"""Portable source/channel/interface audit. It does not certify appearance."""
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/world/phase-2-playground/coaster-workshop-craft-20261105'
blob = (OUT / 'coaster-workshop.glb').read_bytes()
assert struct.unpack_from('<4sII', blob) == (b'glTF', 2, len(blob))
length, kind = struct.unpack_from('<I4s', blob, 12)
assert kind == b'JSON'
g = json.loads(blob[20:20 + length])
bin_length, kind = struct.unpack_from('<I4s', blob, 20 + length)
assert kind == b'BIN\0'
data = memoryview(blob)[28 + length:]
assert len(data) == bin_length


def access(index):
    a = g['accessors'][index]
    view = g['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and view.get('buffer', 0) == 0
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = '<' + {5126:'f', 5125:'I', 5123:'H', 5121:'B'}[a['componentType']] * count
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', struct.calcsize(fmt))
    return [struct.unpack_from(fmt, data, offset + stride * i) for i in range(a['count'])]


triangles = 0
primitives = 0
degenerate = 0
mesh_stats = []
for mesh in g['meshes']:
    stats = {'name': mesh['name'], 'triangles': 0, 'primitives': len(mesh['primitives'])}
    assert len({p['material'] for p in mesh['primitives']}) == len(mesh['primitives']), 'Material batching lost'
    for p in mesh['primitives']:
        primitives += 1
        assert p.get('mode',4) == 4
        attrs = p['attributes']
        assert all(k in attrs for k in ['POSITION','NORMAL','TEXCOORD_0'])
        vertices, normals, uv = (access(attrs[k]) for k in ['POSITION','NORMAL','TEXCOORD_0'])
        assert len(vertices) == len(normals) == len(uv)
        assert all(math.isfinite(v) for arr in [vertices,normals,uv] for row in arr for v in row)
        assert all(.995 < math.hypot(*n) < 1.005 for n in normals)
        indices = [v[0] for v in access(p['indices'])]
        assert len(indices) % 3 == 0 and all(0 <= i < len(vertices) for i in indices)
        for i in range(0,len(indices),3):
            a,b,c = [vertices[k] for k in indices[i:i+3]]
            u,v = [tuple(b[j]-a[j] for j in range(3)),tuple(c[j]-a[j] for j in range(3))]
            area2 = math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
            degenerate += area2 < 1e-11
        stats['triangles'] += len(indices)//3
    triangles += stats['triangles']
    mesh_stats.append(stats)
assert degenerate == 0, f'{degenerate} zero area triangles'
expected_batches={'StaticWorkshop':8,'RequestCarrier':3,'RequestSaddles':1,'ControlLever':3,
                  'Motion_lookup':2,'Motion_plan':4,'Motion_debug':3,
                  'Motion_rewrite':2,'Motion_extract':2,'Motion_act':3,'ShadowWorkshop':1}
def root_meshes(index):
    node=g['nodes'][index]
    result=([node['mesh']] if 'mesh' in node else [])
    for child in node.get('children',[]): result.extend(root_meshes(child))
    return result
root_stats={g['nodes'][i]['name']:[mesh_stats[k] for k in root_meshes(i)]
            for i in g['scenes'][g.get('scene',0)]['nodes']}
assert {name:sum(row['primitives'] for row in rows) for name,rows in root_stats.items()} == expected_batches, root_stats
expected = {'StaticWorkshop','RequestCarrier','RequestSaddles','ControlLever','ShadowWorkshop',*(f'Motion_{tool}' for tool in ['lookup','plan','debug','rewrite','extract','act'])}
roots = {g['nodes'][i]['name'] for i in g['scenes'][g.get('scene',0)]['nodes']}
assert roots == expected, roots
assert not any(g.get(key) for key in ['animations','skins','cameras'])
assert 'KHR_lights_punctual' not in g.get('extensionsUsed',[])
assert 'KHR_materials_clearcoat' in g.get('extensionsUsed',[])
images=[]
for item in g.get('images',[]):
    view=g['bufferViews'][item['bufferView']]
    png=data[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    assert bytes(png[:8]) == b'\x89PNG\r\n\x1a\n'
    size=struct.unpack_from('>II',png,16)
    assert size == (256,256), size
    images.append({'name':item.get('name'),'size':size,'bytes':len(png)})

# Source invariants compare current untouched authoritative files to baseline.
frozen={}
for file in ['WorldIntentWorkshop.tsx','intent-workshop-geometry.ts','intent-workshop-layout.ts','intent-workshop-runtime.ts']:
    path='src/components/world/attractions/'+file
    original=subprocess.check_output(['git','show','b75c474:'+path],cwd=ROOT)
    current=(ROOT/path).read_bytes()
    assert current == original, f'Frozen contract changed: {file}'
    frozen[path]=hashlib.sha256(current).hexdigest()

original=(ROOT/'src/components/world/attractions/WorldIntentWorkshop.tsx').read_text()
candidate=(ROOT/'src/components/world/attractions/WorldIntentWorkshopCraft.tsx').read_text()
def between(source,start,end): return source.split(start,1)[1].split(end,1)[0]
def normalized(source): return ''.join(source.replace('group.current.','group.').split())
assert between(original,'function WorkshopInteraction','function WorkshopMotion') == between(candidate,'function WorkshopInteraction','type CraftModel')
assert normalized(between(original,'const s = useWorkshopStore.getState(), elapsed','  });')) == normalized(between(candidate,'const s = useWorkshopStore.getState(), elapsed','  });'))
assert between(original,'const paths =','  useEffect') == between(candidate,'const paths =','  useEffect')
for snippet in [
    'advanceWorkshop(dt, w.paused || w.poolInspect || !!w.card || !!w.shot, document.hidden);',
    'leverFrame.axis, i === 0 ? intakeLever : id === s.tool ? lever : 0',
    'coasterWorld([at[0] + .96, 1.3, at[2] + .75])',
    'const step = Math.min(3, Math.floor(f * 4)), blend = Math.min(1, f * 4 - step);',
    'positions.p.fromArray(path[step]); positions.b.fromArray(path[step + 1]); positions.p.lerp(positions.b, blend);',
    "s.phase === 'ready' || s.phase === 'processing' || s.phase === 'returning'",
    '<WorldWorkshopSigns />',
    '<TrimeshCollider args={[geometry.contactSurface.vertices, geometry.contactSurface.indices]} />',
]: assert snippet in original and snippet in candidate, snippet
assert candidate.count('<pointLight') == original.count('<pointLight') == 1
report={
    'scope':'CPU GLB/source structure only; no runtime image or performance acceptance',
    'glbBytes':len(blob),'triangles':triangles,'primitives':primitives,'materials':len(g['materials']),
    'visibleSourceTriangles':sum(row['triangles'] for name,rows in root_stats.items() if name!='ShadowWorkshop' for row in rows),
    'shadowSourceTriangles':sum(row['triangles'] for row in root_stats['ShadowWorkshop']),
    'images':images,'roots':sorted(roots),'meshStats':root_stats,'degenerateTriangles':degenerate,
    'frozenSourceHashes':frozen,
    'preservedSourceContracts':['interaction registration','all six motion formulas','all five path points','carrier interpolation','lever x-axis and pivots','original glow','original contacts','original single point lamp'],
    'sha256':hashlib.sha256(blob).hexdigest(),
    'visualAcceptance':'pending ordinary-view WebGL comparison','performance':'pending matched browser measurements',
}
(OUT/'export-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key:report[key] for key in ['glbBytes','triangles','primitives','materials','degenerateTriangles']}))
