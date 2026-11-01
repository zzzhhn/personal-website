"""Read-only reach/clock feasibility of a strict-similarity StartRun candidate.
No playback-rate relaxation, changed contacts, asset write, or new runtime IK.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);bpy.ops.wm.open_mainfile(filepath=str(src))
arm=bpy.data.objects['G24'];sc=bpy.context.scene;a=bpy.data.actions['StartRun']
for tr in arm.animation_data.nla_tracks:tr.mute=True
arm.animation_data.action=a;roots=list(a['rootDistance']);count=int(a['frames']);duration=count/60
lengths={t:sum(arm.data.bones[n+'.'+t].length for n in ['thigh','shin']) for t in ['L','R']}
def travel(t):return 3.6*(t-(1-math.exp(-12*t))/12)
rows=[]
for i in range(count+1):
 sc.frame_set(i);bpy.context.view_layer.update();t=i/60/1.2
 # The MOST favourable permitted speed. Every slower playback needs more body travel before liftoff.
 d=travel(t);delta=d-roots[i]
 for side in ['L','R']:
  if not a['contact'+side][i]:continue
  hip=arm.pose.bones['thigh.'+side].head.copy();ank=arm.pose.bones['foot.'+side].head.copy()
  target=ank-Vector((delta,0,0));hip.z-=.05
  required=(target-hip).length;limit=lengths[side]*.995
  rows.append(dict(frame=i,sourceFrame=float(a['sourceFrames'][0])+float(a['sourceSampleFrames'][i]),side=side,physicalSeconds=t,bodyDistance=d,similarityDistance=roots[i],strideWarpAdditional=delta,requiredLegAfterFull5cmDrop=required,legLimit=limit,unreachableBy=max(0,required-limit)))
first=[r for r in rows if (r['side']=='L' and r['sourceFrame']<=155) or (r['side']=='R' and r['sourceFrame']<=129)]
r=dict(scope='Necessary reach bound only; not A3/A6 acceptance. Exact existing response12 used; no physics edits.',src=str(src),fastestPermittedRate=1.2,pelvisDropAssumed=.05,legLengths=lengths,firstSupportWorst=max(first,key=lambda r:r['unreachableBy']),allStanceWorst=max(rows,key=lambda r:r['unreachableBy']),rows=rows)
json.dump(r,out.open('w'),indent=1);print('REACH',json.dumps({k:v for k,v in r.items() if k!='rows'}))
