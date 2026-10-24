"""Append only StartRun to the locked native G24. Existing actions/mesh are hashed.
Usage: blender -b --factory-startup -P append_start.py -- SOURCE_JSON OUT.blend REPORT.json
No build_guide.main; the old rig and all old actions are retained verbatim.
"""
import bpy, copy, hashlib, json, math, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Quaternion
sys.path.insert(0,str(Path(__file__).parent))
import build_guide as B
import mocap_retarget as MR
repo=Path(__file__).resolve().parents[3]
args=sys.argv[sys.argv.index('--')+1:]
data=json.load(open(args[0])); out=Path(args[1]); report=Path(args[2])
assert out.resolve() != (repo/'tools/world/guide/blend/G24.blend').resolve(), 'Candidate must not overwrite the locked native'
bpy.ops.wm.open_mainfile(filepath=str(repo/'tools/world/guide/blend/G24.blend'))
arm=bpy.data.objects['G24']; mesh=bpy.data.objects['G24_mesh']; sc=bpy.context.scene

def hashval(v): return hashlib.sha256(json.dumps(v,sort_keys=True,default=list).encode()).hexdigest()
def locked():
    return dict(mesh=hashval(dict(vertices=[tuple(v.co) for v in mesh.data.vertices],faces=[tuple(p.vertices) for p in mesh.data.polygons],weights=[[(g.group,g.weight) for g in v.groups] for v in mesh.data.vertices],groups=[g.name for g in mesh.vertex_groups],materials=[m.name for m in mesh.data.materials],materialIndices=[p.material_index for p in mesh.data.polygons])),
        rest=hashval([(b.name,b.parent.name if b.parent else None,[list(r) for r in b.matrix_local],tuple(b.head_local),tuple(b.tail_local)) for b in arm.data.bones]),
        clips={a.name:hashval(dict(curves=[(f.data_path,f.array_index,[(tuple(k.co),k.interpolation) for k in f.keyframe_points]) for f in a.fcurves],extras={k:a[k] for k in a.keys()})) for a in bpy.data.actions if a.name!='StartRun'})
before=locked(); assert 'StartRun' not in bpy.data.actions
for tr in arm.animation_data.nla_tracks: tr.mute=True
B.cache_rest(arm)
# Exact rigid boot shell from the locked skin, not regenerated geometry.
gi=mesh.vertex_groups['foot.R'].index
B.BOOT['offsets']=[v.co-Vector((0,-B.HIP_Y,B.ANKLE_Z)) for v in mesh.data.vertices if sum(g.weight for g in v.groups if g.group==gi)>.98]
arm.animation_data.action=bpy.data.actions['Idle']; sc.frame_set(0); bpy.context.view_layer.update()
idle={p.name:(p.rotation_quaternion.copy(),p.location.copy()) for p in arm.pose.bones}
def dq(n): return arm.pose.bones[n].matrix.to_quaternion()@B.REST[n]['R'].inverted()
idleP={n:dq(n) for n in ['pelvis','spine','chest','head']}
idleP['arms']={t:(dq('upperarm.'+t),dq('forearm.'+t)) for t in ['L','R']}
idleP['hip']=(arm.pose.bones['thigh.L'].head+arm.pose.bones['thigh.R'].head)/2
idleP['feet']={t:[arm.pose.bones['foot.'+t].head.copy(),dq('foot.'+t),Vector((1,0,0))] for t in ['L','R']}
# Obtain one source sample per frame using the existing retarget/arm/knee rules.
O=data['oneshots']['start']; original_fps=O['fps']; O['fps']=60*math.sqrt(B.LEG_LEN/O['leg_m'])
poses=[]
def capture(P):
    poses.append(copy.deepcopy(P)); return idle, {'L':0,'R':0}
MR.make_oneshot_clips(data,B.REST,B.BOOT,dict(LEG=B.LEG_LEN,ANKLE_Z=B.ANKLE_Z,HIP_Y=B.HIP_Y,HIP_Z=B.HIP_Z),capture,idle,60,
    {'StartRun':dict(source='start',a=('start',0),b=('end',0),kind='start',stance='idle',speed=0,pin=False)})
O['fps']=original_fps
assert len(poses)==O['frames'],(len(poses),O['frames'])
sourcePoses=poses; sourceRoot=[float(x*B.LEG_LEN) for x in O['rootDistanceLegs']]
# Frozen §1.2: root scale uses measured standing hip-to-sole height; time sqrt(s).
idleLow=min(idleP['feet'][t][0].z+(idleP['feet'][t][1]@Vector((o.x,o.y*(-1 if t=='L' else 1),o.z))).z for t in ['L','R'] for o in B.BOOT['offsets'])
targetHipHeight=idleP['hip'].z-idleLow
heightScale=targetHipHeight/O['sourceHipHeight']
sourceRoot=[float(x*O['leg_m']*heightScale) for x in O['rootDistanceLegs']]
sourceDuration=(O['frames']-1)/original_fps
similarityDuration=sourceDuration*math.sqrt(heightScale)
N=max(3,round(similarityDuration*60))+1
sourceX=[(len(sourcePoses)-1)*k/(N-1) for k in range(N)]
root=[float(np.interp(x,range(len(sourceRoot)),sourceRoot)) for x in sourceX]
poses=[]
for x in sourceX:
    i=min(len(sourcePoses)-2,int(x));w=x-i;A,C=sourcePoses[i:i+2]
    P={n:A[n].slerp(C[n],w) for n in ['pelvis','spine','chest','head']}
    P['hip']=A['hip'].lerp(C['hip'],w)
    P['arms']={t:tuple(A['arms'][t][j].slerp(C['arms'][t][j],w) for j in (0,1)) for t in ['L','R']}
    P['feet']={t:[A['feet'][t][0].lerp(C['feet'][t][0],w),A['feet'][t][1].slerp(C['feet'][t][1],w),A['feet'][t][2].lerp(C['feet'][t][2],w).normalized()] for t in ['L','R']}
    poses.append(P)
contact={t:[O['sourceContact'][t][min(len(sourcePoses)-1,round(x))] for x in sourceX] for t in ['L','R']}

def smooth(x): x=max(0,min(1,x)); return x*x*(3-2*x)
def offsets(q,t):
    return [q@Vector((o.x,o.y*(-1 if t=='L' else 1),o.z)) for o in B.BOOT['offsets']]
# A continuous alignment from the actual locked Idle pose. Body rotation deltas fade
# over the measured first step; ankles stay in their measured relative trajectories.
first=copy.deepcopy(poses[0]); alignment={t:idleP['feet'][t][0]-first['feet'][t][0] for t in ['L','R']}
for k,P in enumerate(poses):
    keep=1-smooth(root[k]/.22)
    for n in ['pelvis','spine','chest','head']:
        P[n]=Quaternion().slerp(idleP[n]@first[n].inverted(),keep)@P[n]
    P['hip']+=(idleP['hip']-first['hip'])*keep
    for t in ['L','R']:
        P['arms'][t]=tuple(Quaternion().slerp(idleP['arms'][t][j]@first['arms'][t][j].inverted(),keep)@P['arms'][t][j] for j in (0,1))
        P['feet'][t]=list(P['feet'][t]); P['feet'][t][0]+=alignment[t]
        P['feet'][t][2]=idleP['feet'][t][2].lerp(P['feet'][t][2],1-keep).normalized()
# Bake each fixed source-contact interval independently against variable root travel.
# Lowest sole pivot can roll, but its world anchor never translates while planted.
maxCorrection={}; groundLift={}
for t in ['L','R']:
    active=False; pivot=None; anchor=None; prev=None; prevOff=None; lastDelta=Vector(); liftFrame=0; mx=0; lift=0
    for k,P in enumerate(poses):
        a,q,pole=P['feet'][t]; raw=a.copy(); off=offsets(q,t)
        if contact[t][k]:
            cand=min(range(len(off)),key=lambda j:off[j].z)
            if not active:
                pivot=cand; anchor=a+off[pivot]+Vector((root[k],0,0))
            elif off[pivot].z>off[cand].z+.001:
                anchor=prev+prevOff[cand]+Vector((root[k-1],0,0)); pivot=cand
            a=Vector((anchor.x-root[k]-off[pivot].x,anchor.y-off[pivot].y,-off[pivot].z))
            lastDelta=a-raw; active=True; liftFrame=k
        else:
            if active: active=False
            # Carry the contact correction continuously into the measured swing and
            # return to its trajectory before the next fixed touchdown.
            nextContact=next((j for j in range(k,N) if contact[t][j]),N-1)
            w=1-smooth((k-liftFrame)/max(1,nextContact-liftFrame))
            a+=lastDelta*w
            lo=min((a+o).z for o in off)
            if lo<0: a.z-=lo; lift=max(lift,-lo)
        P['feet'][t][0]=a; prev=a.copy(); prevOff=off
        mx=max(mx,(a-raw).length)
    maxCorrection[t]=mx; groundLift[t]=lift
# One offline solve only. No runtime IK is introduced. Report unreachable targets.
frames=[]; stretch=0; pelvisDrop=0
for k,P in enumerate(poses):
    # Keep measured targets reachable without letting the offline clamp float a sole.
    drop=0.0
    for t,sg in [('L',1),('R',-1)]:
        h=P['hip']+P['pelvis']@Vector((0,sg*B.HIP_Y,0)); a=P['feet'][t][0]
        length=(B.REST['thigh.'+t]['tail']-B.REST['thigh.'+t]['head']).length+(B.REST['shin.'+t]['tail']-B.REST['shin.'+t]['head']).length
        horizontal=(h.x-a.x)**2+(h.y-a.y)**2
        maxz=math.sqrt(max(0,(length*.995)**2-horizontal))
        drop=max(drop,h.z-a.z-maxz)
    drop=min(.05,max(0,drop)); P['hip'].z-=drop; pelvisDrop=max(pelvisDrop,drop)
    local,st=B.solve_pose_world(P); stretch=max(stretch,*st.values()); frames.append(local)
a=bpy.data.actions.new('StartRun'); a.use_fake_user=True; arm.animation_data.action=a
for k,local in enumerate(frames):
    for p in arm.pose.bones:
        p.rotation_mode='QUATERNION'; p.rotation_quaternion,p.location=local[p.name]
        p.keyframe_insert('rotation_quaternion',frame=k,group=p.name)
        if p.name=='pelvis': p.keyframe_insert('location',frame=k,group=p.name)
for f in a.fcurves:
    for kp in f.keyframe_points: kp.interpolation='LINEAR'
a['frames']=N-1;a['loop']=False;a['designSpeedMps']=root[-1]/((N-1)/60)
a['contactL']=contact['L'];a['contactR']=contact['R'];a['rootDistance']=root
a['sourceFrames']=data['evidence']['framesZeroBasedInclusive'];a['sourceFps']=original_fps;a['sourceTake']=data['evidence']['source'];a['sourceSampleFrames']=sourceX;a['authorDuration']=(N-1)/60;a['similarityDuration']=similarityDuration;a.frame_range=(0,N-1)
arm.animation_data.action=None
tr=arm.animation_data.nla_tracks.new();tr.name='StartRun';tr.strips.new('StartRun',0,a);tr.mute=True
for p in arm.pose.bones: p.rotation_quaternion=Quaternion();p.location=Vector();p.scale=(1,1,1)
sc.frame_set(0);sc.render.fps=60
assert locked()==before,'Locked native content changed'
out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out))
rep=dict(status='candidate_unvalidated',lockedBefore=before,lockedAfter=locked(),source=data['evidence'],frames=N-1,duration=(N-1)/60,sourceDuration=sourceDuration,similarityDuration=similarityDuration,heightScale=heightScale,targetHipHeight=targetHipHeight,sourceHipHeight=O['sourceHipHeight'],authorRetime=similarityDuration/((N-1)/60),sourceSampleFrames=sourceX,rootDistance=root,contact=contact,contactCorrectionMaxM=maxCorrection,swingGroundLiftMaxM=groundLift,pelvisDropMaxM=pelvisDrop,ikOverstretchMaxM=stretch,
    authored=['Existing retarget limb proportions and arm/knee rules','First pose aligned continuously to locked Idle; body delta fades over first .22m','Fixed source contact intervals; per-interval variable-root sole-pivot bake','Offline reach fit bounded to 5cm; existing two-bone solver, no new runtime IK','Root spatial and time similarity use measured static hip-to-sole height, not legacy leg-length ratio; only frame-grid rounding'])
json.dump(rep,report.open('w'),indent=1);print('START_REPORT',json.dumps({k:v for k,v in rep.items() if k not in ['lockedBefore','lockedAfter','source','rootDistance','contact']}))
