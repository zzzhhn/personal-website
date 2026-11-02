"""Derive exact placement/camera handoff from the frozen live layout, without a browser."""
import json
import math
from pathlib import Path

HERE=Path(__file__).resolve().parent
OUT=HERE/'cameras.json'
centre=(-42,4.8,30)
def pad(index):
    angle=index*math.pi/4
    return [centre[0]+15*math.cos(angle),4.9,centre[2]+15*math.sin(angle)]
def yaw(index): return math.pi-index*math.pi/4
def offset(index,x,z):
    a=index*math.pi/4; p=pad(index)
    return [p[0]+math.cos(a)*x-math.sin(a)*z,p[1],p[2]+math.sin(a)*x+math.cos(a)*z]
def rotated(x,z,angle): return [x*math.cos(angle)+z*math.sin(angle),-x*math.sin(angle)+z*math.cos(angle)]
def camera(position,angle,height,distance):
    target=[position[0],position[1]+height,position[2]]
    return {'position':[target[0]+math.cos(angle)*distance+.18*math.sin(angle),target[1]+distance*.32,target[2]-math.sin(angle)*distance+.18*math.cos(angle)],'target':target,'fov':50}
desk=pad(3); delta=rotated(-.4,-.62,yaw(3)); lantern=[desk[0]+delta[0],desk[1]+.85,desk[2]+delta[1]]
placements={
    'C12':[{'position':pad(2),'yaw':yaw(2),'scale':1,'groundPlane':4.9,'bodyStartY':4.904}],
    'C13':[{'position':offset(6,x,z),'yaw':yaw(6)+angle,'scale':1.7,'groundPlane':4.9,'bodyStartY':4.904} for x,z,angle in [(-.05,.95,-.05),(-.62,.9,.12)]],
    'C14':[{'position':pad(1),'yaw':yaw(1),'scale':1.3,'groundPlane':4.9}],
    'C15':[{'position':pad(0),'yaw':yaw(0),'scale':1,'groundPlane':4.9,'bodyStartY':4.904}],
    'C16':[{'position':lantern,'yaw':yaw(3)+.5,'scale':1,'supportPlane':5.75}],
}
anchors={
    'C12':{'id':'camp-about-guitar','position':[-42,5.4,44.1],'radius':1.8,'feedback':'guitar'},
    'C13':{'id':'camp-about-dumbbell','position':offset(6,-1.55,.95),'radius':1.5,'feedback':'dumbbell'},
    'C14':{'id':'camp-about-wok','position':[-42+14.1/math.sqrt(2),5.4,30+14.1/math.sqrt(2)],'radius':1.8,'feedback':'wok'},
    'C15':{'id':'camp-about-suitcase','position':[-27.85,5.3,30],'radius':1.8,'feedback':'suitcase'},
}
anchors['C13']['position'][1]=5.3
cameras={}
for aid,families in placements.items():
    place=families[0]
    height,distance={'C12':(.62,2.0),'C13':(.13,1.0),'C14':(.38,1.65),'C15':(.43,1.65),'C16':(.16,.72)}[aid]
    cameras[aid]=camera(place['position'],place['yaw'],height,distance)
receipt={'source':'WorldCampContentLayout.ts + WorldCampContent.tsx at frozen batch4; proposals, not browser-observed cameras',
    'placements':placements,'suggestedCameras':cameras,'interactionAnchors':anchors,
    'capture':{'query':'?qa=1','legacyQuery':'?qa=1&facilityCraft=legacy','timeHours':[12,0],'api':'window.__worldCampQA.close(position,target)','release':'window.__worldCampQA.release()','viewport':'match coordinator viewport and quality; do not compare different sizes'},
    'feedback':'Trigger actual E near each anchor; close camera shot pauses motion clocks. Capture interaction after releasing QA close. No direct synthetic feedback API is added.'}
OUT.write_text(json.dumps(receipt,indent=2)+'\n')
print(str(OUT))
