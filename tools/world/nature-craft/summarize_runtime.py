"""Bounded evidence audit; reads saved UI QA receipts, never controls the browser."""
from pathlib import Path
import json, math, statistics
R=Path(__file__).resolve().parents[3]
P=R/'docs/world/phase-2-playground/asset-batch4-20261102/runtime'
rows=[];windows={}
for f in sorted(P.glob('*-sample-*.json')):
 j=json.loads(f.read_text())
 if 'r2=1' not in j['before']['url']:continue
 a,b=j['before'],j['after'];samples=j['samples'];assert len(samples)==300
 assert len({s['frame'] for s in samples})==300 and all(s['dt']>0 and math.isfinite(s['dt']) for s in samples)
 for e in [a,b]:
  assert e['renderInfo']['drawingBuffer']==[1710,931] and e['renderInfo']['cssSize']==[1710,931]
  assert e['grounded'] and e['loop']['mode']=='always'
  s=e['settings'];assert s['quality']=='balanced' and s['weather']=='clear' and s['light']=='noon' and s['worldMinutes']==720
  assert not s['paused'] and not s['shot'] and not s['timeRunning'] and not s['seat'] and not s['activeVehicle']
  assert abs(e['loop']['night'])<.001
 assert max(abs(x-y) for x,y in zip(a['stats']['camera'],b['stats']['camera']))<1e-5
 counters=sorted(set((s['calls'],s['triangles']) for s in samples));summary=j['summary']
 row=dict(mode=a['mode'],view=a['active'],file=f.name,**summary,counterVariants=counters,
          buffer=a['renderInfo']['drawingBuffer'],camera=a['camera'],allocationsBefore={k:a['stats'][k] for k in ['geometries','textures','programs']},
          allocationsAfter={k:b['stats'][k] for k in ['geometries','textures','programs']})
 rows.append(row);windows[(a['mode'],a['active'])]=j
assert len(rows)==4,('Need final candidate/legacy camp/water windows',len(rows))
pairs=[]
for view in ['n-camp','n-water']:
 a=windows[('candidate',view)]['before'];b=windows[('legacy',view)]['before']
 pos=max(abs(x-y) for x,y in zip(a['stats']['camera'],b['stats']['camera']))
 player=max(abs(x-y) for x,y in zip(a['player'],b['player']))
 angle=max(abs(a['camera'][k]-b['camera'][k]) for k in ['yaw','pitch','distance','fov'])
 assert pos<.01 and player<.01 and angle<.001,(view,pos,player,angle)
 pairs.append(dict(view=view,maxCameraPositionErrorM=pos,maxPlayerPositionErrorM=player,maxCameraAngleDistanceError=angle))
trails=[(f.name,json.loads(f.read_text())) for f in P.glob('candidate-n-grass-trail-*.json')]
trails.sort(key=lambda a:a[1]['world']['at']);assert len(trails)>=3
assert trails[0][1]['amount']>.9 and trails[1][1]['amount']>.3 and trails[-1][1]['amount']==0
assert math.dist(trails[0][1]['world']['player'],trails[1][1]['world']['player'])>2
motion=[]
for f in P.glob('candidate-*-motion-*.json'):
 j=json.loads(f.read_text());a,b=j['before'],j['after']
 motion.append(dict(file=f.name,view=a['active'],windSeconds=b['loop']['windTime']-a['loop']['windTime'],frames=b['loop']['frame']-a['loop']['frame']))
result=dict(revision='r2-helper-safe-ground',windows=rows,pairs=pairs,grassTrail=[dict(file=n,amount=j['amount'],player=j['world']['player'],at=j['world']['at']) for n,j in trails],motion=motion,
 limits='Sequential single300-frame windows, no GPU timing/randomization/thermal control; stable counters do not prove equal GPU cost or whole-island performance.')
bush=[(f.name,json.loads(f.read_text())) for f in P.glob('candidate-interaction-bush-noon-*.json')]
bush.sort(key=lambda a:a[1]['at']);inside=[len(j['bush']['lastInside']) for _,j in bush]
assert inside[0]==0 and max(inside)>0 and inside[-1]==0
assert all(j['bush']['verticalImpulseTotal']==0 for _,j in bush)
result['bush']=[dict(file=n,inside=len(j['bush']['lastInside']),verticalImpulseTotal=j['bush']['verticalImpulseTotal'],at=j['at']) for n,j in bush]
(P/'summary-r2.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'windows':[(r['mode'],r['view'],round(r['fps'],3),round(r['p95'],2),r['counterVariants']) for r in rows],'pairs':pairs,'trail':[j['amount'] for _,j in trails]},ensure_ascii=False))
