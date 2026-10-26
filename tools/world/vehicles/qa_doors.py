"""Bounded, dependency-free validation of serialized final vehicle door contracts.
Run after build_doors.py: python3 tools/world/vehicles/qa_doors.py
"""
import json, struct, subprocess, pathlib, hashlib, itertools
ROOT=pathlib.Path(__file__).resolve().parents[3]
DOC=ROOT/'docs/world/vehicles';SRC=ROOT/'tools/world/vehicles'
# Keep the pre-door asset baseline stable after this change is committed.
BASELINE_REVISION='2d1b9c89b9ffdad87143c3d49d92759565804cd7'

def gltf(data):
    size,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    return json.loads(data[20:20+size])

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def serialized_bounds(data):
    points=[]
    for node in data['nodes']:
        if 'mesh' not in node:continue
        x,y,z,w=node.get('rotation',[0,0,0,1]);t=node.get('translation',[0,0,0])
        for primitive in data['meshes'][node['mesh']]['primitives']:
            a=data['accessors'][primitive['attributes']['POSITION']]
            for p in itertools.product(*zip(a['min'],a['max'])):
                # Quaternion-vector rotation followed by the exported translation.
                u=[2*(y*p[2]-z*p[1]),2*(z*p[0]-x*p[2]),2*(x*p[1]-y*p[0])]
                r=[p[0]+w*u[0]+y*u[2]-z*u[1],p[1]+w*u[1]+z*u[0]-x*u[2],p[2]+w*u[2]+x*u[1]-y*u[0]]
                points.append([r[i]+t[i] for i in range(3)])
    return [[round(min(p[i] for p in points),4) for i in range(3)],[round(max(p[i] for p in points),4) for i in range(3)]]

contract=json.loads((SRC/'door-contract.json').read_text());results=[]
for asset,key in [('G25','offroad'),('G26','coupe'),('G27','van')]:
    local_bounds=[]
    for suffix in ['', '-lod1']:
        name=asset+suffix;path=ROOT/f'public/assets/world/vehicles/{name}.glb'
        record=json.loads((DOC/f'door-{name}-report.json').read_text());data=gltf(path.read_bytes())
        original=gltf(subprocess.check_output(['git','show',f'{BASELINE_REVISION}:public/assets/world/vehicles/{name}.glb'],cwd=ROOT))
        original_tris=sum(original['accessors'][p['indices']]['count']//3 for n in original['nodes'] if 'mesh' in n for p in original['meshes'][n['mesh']]['primitives'])
        record['baselineTris']=original_tris;record['deltaRatio']=record['totalTris']/original_tris-1
        (DOC/f'door-{name}-report.json').write_text(json.dumps(record,indent=2)+'\n')
        mats={m['name']:m for m in data['materials']};oldmats={m['name']:m for m in original['materials']}
        assert mats==oldmats,(name,'serialized material behavior changed')
        new_bounds=serialized_bounds(data);old_bounds=serialized_bounds(original)
        bound_delta=max(abs(a-b) for nr,oldr in zip(new_bounds,old_bounds) for a,b in zip(nr,oldr))
        assert bound_delta <= (.001 if suffix else 0),(name,'closed asset bounds exceed preserved tolerance',new_bounds,old_bounds)
        nodes={n.get('name'):n for n in data['nodes']};root=nodes[asset];body=nodes[asset+'_body']
        children=[data['nodes'][i]['name'] for i in root.get('children',[])]
        assert all(n in children for n in ['door-left','door-right',asset+'_body'])
        assert not any(data['nodes'][i]['name'].startswith('door-') for i in body.get('children',[]))
        h=contract[key]['hinge']
        for side,sgn in [('door-left',-1),('door-right',1)]:
            translation=nodes[side]['translation'];expect=[h[0],h[1],sgn*h[2]]
            assert max(abs(a-b) for a,b in zip(translation,expect))<1e-6,(side,translation,expect)
        assert sha(path)==record['glbSha256']
        assert all(c['degenerate']==0 and c['nonManifoldEdges']==0 and c['finite'] for c in record['checks'].values())
        assert all(r['clear'] for bundle in ['witnesses','freshImportWitnesses'] for category in ['apertureSideRays','openDoorTransferRays'] for r in record[bundle][category])
        local_bounds.append(record['doorBounds'])
        results.append(dict(asset=name,triangles=record['totalTris'],baseline=record['baselineTris'],triangleDeltaRatio=record['deltaRatio'],materialsExact=True,closedBoundsMaxDeltaM=bound_delta,closedBoundsToleranceM=.001 if suffix else 0,doorParentage=True,hinges=True,glbSha256=record['glbSha256'],bounds=record['bounds']))
    union=dict(min=[min(b['min'][i] for b in local_bounds) for i in range(3)],max=[max(b['max'][i] for b in local_bounds) for i in range(3)])
    contract[key]['doorBounds']=union
(SRC/'door-contract.json').write_text(json.dumps(contract,indent=2)+'\n')
summary=dict(passed=True,baselineRevision=BASELINE_REVISION,assets=results,sourceSha256={p.name:sha(p) for p in [SRC/'build_doors.py',SRC/'qa_doors.py',SRC/'build_vehicle.py',SRC/'build_lod.py',SRC/'vehlib.py',SRC/'door-contract.json']},colliderSha256=sha(ROOT/'src/components/world/WorldVehicleHulls.json'))
companion=pathlib.Path('/tmp/vehicle-door-G26-uncompressed.glb')
if companion.exists():summary['temporaryFitCompanion']=dict(path=str(companion),sha256=sha(companion),bytes=companion.stat().st_size,owner='primary runtime fit analysis; remove after acceptance')
(DOC/'door-validation.json').write_text(json.dumps(summary,indent=2)+'\n')
for r in results:print(r['asset'],r['triangles'],'materials/parentage/hinges/clearance PASS')
