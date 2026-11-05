"""Actual evaluated source bounds through every carrier route, without rendering.

The fixtures are the frozen layout solids / apparatus dimensions, not new
collision geometry. AABB separation proves nonintersection; contact (touching)
is allowed. This is a bounded geometry audit, not Rapier gameplay acceptance.
"""
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/world/phase-2-playground/coaster-workshop-craft-20261105'
PARTS=json.loads((OUT/'construction-bounds.json').read_text())
TOL=2e-5
TOOLS={'lookup':(-24,65),'plan':(-20,60),'debug':(-15,59),'rewrite':(-10,62),'extract':(-8,67),'act':(-9,73)}

def matching(prefix): return [(name,row) for name,row in PARTS.items() if name.startswith(prefix)]
def one(prefix):
    rows=matching(prefix)
    assert len(rows)==1,(prefix,len(rows))
    return rows[0][1]
def near(a,b): assert abs(a-b)<TOL,(a,b)
def moved(row,offset,scale_x=1):
    return {'min':[row['min'][0]*scale_x+offset[0],row['min'][1]+offset[1],row['min'][2]+offset[2]],
            'max':[row['max'][0]*scale_x+offset[0],row['max'][1]+offset[1],row['max'][2]+offset[2]]}
def box(center,size):return {'min':[a-b/2 for a,b in zip(center,size)],'max':[a+b/2 for a,b in zip(center,size)]}
def overlap(a,b):return all(min(a['max'][i],b['max'][i])-max(a['min'][i],b['min'][i])>TOL for i in range(3))
def sep(a,b):return max(b['min'][i]-a['max'][i] for i in range(3)) if not overlap(a,b) else -1

fixtures=[]
def fixture(name,x,z,p,size):fixtures.append((name,box((x+p[0],p[1],z+p[2]),size)))
for kind,(x,z) in {'intake':(-16,73),**TOOLS}.items():
    fixture(kind+' full cabinet',x,z,(0,.68,0),(2.8,1.36,2.3))
    fixture(kind+' sign',x,z,(0,2.55,-.92),(2.8,.65,.18))
    fixture(kind+' crossbar',x,z,(0,3.65,-.85),(2.5,.26,.26))
    for side in (-1,1):fixture(kind+' mast',x,z,(side*1.15,2.375,-.85),(.2,4.15,.2))
    if kind=='intake':
        for center in (-.96,.52):fixture('intake full channel contact',x,z,(center,1.48,0),(.12,.28,1.65))
        for i in range(9):fixture('intake roller envelope',x,z,(-.225,1.42,-.6+i*.15),(1.25,.14,.14))
    elif kind in ('lookup','act'):
        for i in range(3):
            sx=-.7+i*.58
            fixture(kind+' seat pan',x,z,(sx,1.49,-.2),(.43,.15,.48))
            fixture(kind+' seat pad',x,z,(sx,1.59,-.17),(.34,.08,.37))
            fixture(kind+' seat back',x,z,(sx,1.74,-.44),(.43,.46,.14))
            fixture(kind+' back pad',x,z,(sx,1.75,-.35),(.31,.3,.045))
            for side in (-1,1):fixture(kind+' arm',x,z,(sx+side*.21,1.73,-.16),(.07,.07,.44))
        if kind=='lookup':fixture('scanner pedestal',x,z,(-1.04,1.67,.57),(.42,.64,.45))
        else:
            fixture('act full gearbox',x,z,(.98,1.69,-.4),(.48,.68,.65))
            fixture('act wheel envelope',x,z,(.98,1.72,0),(.4,.4,.14))
            fixture('act old ticket',x,z,(.98,1.5,.21),(.35,.035,.36))
    elif kind=='plan':
        for sx,sz in [(-.85,.25),(-.2,-.5),(.45,.25)]:
            fixture('plan waypoint',x,z,(sx,1.41,sz),(.4,.14,.35))
            fixture('plan socket',x,z,(sx,1.495,sz),(.22,.025,.2))
        fixture('plan console',x,z,(.98,1.65,-.55),(.4,.63,.42))
    elif kind=='debug':
        fixture('debug vice',x,z,(-.85,1.48,-.42),(.56,.28,.5))
        fixture('debug motor',x,z,(.86,1.65,-.38),(.6,.64,.6))
        fixture('debug bearing',x,z,(.86,1.91,-.03),(.34,.34,.14))
        fixture('debug loop circular envelope',x,z,(-.85,1.84,-.42),(.67,.67,.13))
    elif kind=='rewrite':
        for dz in (-.65,.65):
            fixture('rewrite barrel circular envelope',x,z,(0,1.78,dz),(1.66,.3,.3))
            for dx in (-.95,.95):fixture('rewrite cheek',x,z,(dx,1.61,dz),(.22,.54,.34))
        for dz in (-.94,.94):fixture('rewrite tray',x,z,(0,1.43,dz),(1.2,.025,.3))
    elif kind=='extract':
        for dx in (-.91,.91):fixture('extract guide',x,z,(dx,1.76,-.73),(.28,.85,.45))
        fixture('extract head',x,z,(0,2.05,-.84),(2.08,.28,.25))
        for i in range(3):
            dx=-.6+i*.55
            fixture('extract bed',x,z,(dx,1.37,.34),(.47,.07,1.3))
            for side in (-1,1):fixture('extract fixed lane wall',x,z,(dx+side*.245,1.42,.36),(.035,.16,1.3))

# All contact-bearing central upper planes are measured from evaluated source.
tops={
    'Lookup | seat 0 contact insert':1.63,'Lookup | seat 0 contact pan':1.565,
    'Lookup | scanner contact crown':1.99,'Act | ticket contact platen':1.5175,
    'Plan | waypoint 0 contact crown':1.48,'Plan | waypoint socket 0':1.5075,
    'Debug | vice contact crown':1.62,'Debug | motor contact crown':1.97,
    'Extract | guide contact crown':2.185,'Extract | head contact crown':2.19,
    'Bell | full contact crown':1.30,
}
for prefix,height in tops.items():
    for _,row in matching(prefix):near(row['max'][1],height)
for kind in ['Intake','Lookup','Debug','Rewrite','Extract','Act']:near(one(kind+' | full walking contact cap')['max'][1],1.36)
for _,row in matching('Plan | contact cap'):near(row['max'][1],1.36)
near(one('Plan | flush route bed')['max'][1],1.36)
for _,row in matching('Intake | bearing channel folded return'):
    if row['max'][1]>1.6:near(row['max'][1],1.62)
near(one('Plan | waypoint contact shoe')['min'][1]+1.65,1.5075)
near(one('Act | stamp contact face')['min'][1]+1.63,1.529)
near(one('Rewrite | moving paper stock')['min'][1]+1.53,1.4425)
for _,row in matching('Request | transport saddle foot'):near(row['min'][1]+1.66,1.49)
near(one('Request | rounded raised document pan')['min'][1]+1.60,1.603)
assert one('debug | moving bearing carriage')['min'][2]>.04
for _,row in matching('Extract | output '):
    if 'lens' not in _:assert row['min'][1]+1.53>1.50

carrier=[(name,row) for name,row in PARTS.items() if row['root'] in ('RequestCarrier','RequestSaddles')]
motions={tool:[(name,row) for name,row in PARTS.items() if row['root']=='Motion_'+tool] for tool in TOOLS}

def root_at(tool,progress):
    x,z=TOOLS[tool]
    path=[(-16,1.66,73),(-16,3.15,72.15),(-16,3.15,67),(x,3.15,z-.85),(x,1.6,z)]
    step=min(3,int(progress*4));blend=min(1,progress*4-step)
    return [path[step][i]+(path[step+1][i]-path[step][i])*blend for i in range(3)]
def motion_at(tool,t):
    x,z=TOOLS[tool];f=max(0,min(1,(t-1.5)/1.3))
    if tool=='lookup':return (x-.7+1.15*f,2.05,z-.2),1
    if tool=='act':return (x,2.03-.4*f,z),1
    if tool=='plan':return (x-.85+1.3*f,1.65,z+.25-.75*math.sin(f*math.pi)),1
    if tool=='debug':return (x-.8+1.4*f,1.65,z),1
    if tool=='rewrite':return (x,1.53,z+.6-1.2*math.sin(f*math.pi)),1
    return (x,1.53,z+.5*f),.2+.8*f

def carrier_pose(tool,progress):
    root=root_at(tool,progress)
    return [(name,moved(row,[root[0],root[1]+(.295*min(1,progress*16) if row['root']=='RequestSaddles' else 0),root[2]])) for name,row in carrier]

def swept_overlap(a0,a1,b):
    # Exact time interval for linearly moving axis-aligned bounds. Carrier
    # position and the short saddle stroke are piecewise linear; include
    # their breakpoints explicitly, then solve six strict slab inequalities.
    lower,upper=0.,1.
    for axis in range(3):
        for start,end in [(a0['max'][axis]-b['min'][axis]-TOL,a1['max'][axis]-b['min'][axis]-TOL),
                          (b['max'][axis]-a0['min'][axis]-TOL,b['max'][axis]-a1['min'][axis]-TOL)]:
            delta=end-start
            if abs(delta)<1e-12:
                if start<=0:return False
            elif delta>0:lower=max(lower,-start/delta)
            else:upper=min(upper,-start/delta)
            if lower>=upper-1e-9:return False
    return lower<upper-1e-9

continuous_intervals=0
breakpoints=[0,1/16,.25,.5,.75,1]
for tool in TOOLS:
    for a,b in zip(breakpoints,breakpoints[1:]):
        first,last=carrier_pose(tool,a),carrier_pose(tool,b)
        for (name,row0),(_,row1) in zip(first,last):
            for label,solid in fixtures:
                continuous_intervals+=1
                assert not swept_overlap(row0,row1,solid),(tool,a,b,name,label)

conflicts=[];samples=0;dynamic_samples=0
for tool in TOOLS:
    for returning in (False,True):
        # Same phase mapping as workshopCarrierProgress, sampled uniformly.
        for i in range(801):
            progress=(1-i/800) if returning else i/800
            posed=carrier_pose(tool,progress)
            samples+=1
            for name,row in posed:
                for label,solid in fixtures:
                    if overlap(row,solid):conflicts.append((tool,'returning' if returning else 'processing',i,name,label))
            # During processing the routed tool operates, and other completed
            # outputs may all remain visible. Check every output, not only its
            # endpoint or the current tool. Return phases freeze outputs at f=1.
            for output in TOOLS:
                t=2.8 if returning or output!=tool else progress*2.8
                at,sx=motion_at(output,t)
                for output_name,output_part in motions[output]:
                    output_box=moved(output_part,at,sx)
                    for name,row in posed:
                        dynamic_samples+=1
                        if overlap(row,output_box):conflicts.append((tool,'returning' if returning else 'processing',i,name,output_name))

# Static radial beams have a global lower face y=3.50; the capsule's highest
# evaluated local surface plus 3.15 travel datum remains below this plane.
lag_pair_samples=0
for tool in TOOLS:
    for lag in (.025,.10,.25):
        for i in range(201):
            progress=i/200
            posed=carrier_pose(tool,progress)
            at,sx=motion_at(tool,max(0,progress*2.8-lag))
            for output_name,output_part in motions[tool]:
                output_box=moved(output_part,at,sx)
                for name,row in posed:
                    lag_pair_samples+=1
                    assert not overlap(row,output_box),(tool,'one-frame elapsed lag',lag,i,name,output_name)
top=max(row['max'][1]+(.295 if row['root']=='RequestSaddles' else 0) for _,row in carrier)+3.15
assert top<3.50
assert not conflicts, conflicts[:16]
report={
    'scope':'Evaluated native source AABB / source-profile audit across all routes and state phases. No Rapier actor simulation, triangle-level contact or visual acceptance.',
    'carrierRouteSamples':samples,'dynamicPartPairSamples':dynamic_samples,
    'samplesPerPhasePerTool':801,'phases':['processing','returning'],
    'staticFixtures':len(fixtures),'conflicts':conflicts,
    'exactPiecewiseLinearStaticIntervalChecks':continuous_intervals,
    'staticSweep':'All carrier/source-part AABB trajectories are checked continuously against the static fixture boxes over their exact linear segments; processing and return traverse the same path.',
    'lagBoundary':{'additionalChildMotionElapsedLagSeconds':[.025,.10,.25],'samplesPerLagPerTool':201,'partPairSamples':lag_pair_samples,
                   'reason':'Original separate useFrame callbacks can observe adjacent clock samples. The original clock rejects dt > .25; the visual candidate adds no different clock.'},
    'upperContactPlaneChecks':tops,
    'carrierTravelTop':top,'carrierRailLowerPlane':3.50,'carrierRailClearance':3.50-top,
    'fixedRoots':'All original motion / carrier root formulas remain unchanged; corrections are native local geometry.',
    'roundingLimit':'Central accessible upper planes are aligned. Existing old polygonal cylinder contacts and new denser curved surfaces differ by millimetres between facet vertices; rounded side-corners remain conservative coarse-contact approximations.',
}
(OUT/'contact-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key:report[key] for key in ['carrierRouteSamples','dynamicPartPairSamples','staticFixtures','carrierRailClearance']}))
