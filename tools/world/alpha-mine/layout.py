"""Alpha mine contract in glTF-local metres: +Y up, entrance +Z, depth -Z.
Pure Python; the model, proxy builder and runtime manifest share these exact values.
"""
from pathlib import Path
import json, math

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/world/alpha-mine'
XS = [-24,-22,-21,-17,-16, -14.6, -13.1, -10.5, -8.6, -6.4, -3.7, -1, 2, 5, 7.5, 10.5, 13.1, 14.6, 16,17,21,22,24]
ZS = [-52,-50,-48,-46,-44,-41,-39,-37,-36, -35.6, -33, -30, -29,-27.8, -25.6, -24,-23.6, -21, -18.4, -16,-15, -12, -9, -6, -3, 0,2]

RAMPS = [
    {'id': 'ramp-west-0-3', 'a': [-11.8, 0, -9], 'b': [-11.8, 3, -21], 'deckWidth': 2.6, 'clearWidth': 2.4},
    {'id': 'ramp-east-3-6', 'a': [11.8, 3, -21], 'b': [11.8, 6, -33], 'deckWidth': 2.6, 'clearWidth': 2.4},
]
BRIDGE = {'id': 'bridge-middle', 'a': [-3.7, 3, -22.3], 'b': [7.5, 3, -22.3], 'deckWidth': 2.6, 'clearWidth': 2.4}
GALLERY_RAMPS = [
    {'id':'gallery-west-entry','a':[-19,0,-3],'b':[-19,3,-15],'deckWidth':3.0,'clearWidth':2.8},
    {'id':'gallery-west-rise','a':[-19,3,-29],'b':[-19,6,-41],'deckWidth':3.0,'clearWidth':2.8},
]
GALLERY_BRIDGES = [
    {'id':'gallery-west-link','a':[-19,3,-22.3],'b':[-11.8,3,-22.3],'deckWidth':2.6,'clearWidth':2.4,'railInset':1.55},
    {'id':'bridge-north-ravine','a':[-8.6,6,-43],'b':[7.5,6,-43],'deckWidth':3.0,'clearWidth':2.8},
]
GALLERY_ROUTE = [[-19,0,-3],[-19,3,-15],[-19,3,-22.3],[-19,3,-29],[-19,6,-41],
                 [-19,6,-43],[-8.6,6,-43],[7.5,6,-43],[17,6,-43],[17,6,-37],
                 [8.8,6,-37],[8.8,6,-34.1]]
LAMPS = [[-13.3,2.65,-.65],[-20.4,5.65,-18],[9.7,4.9,-23.2],[-19.9,5.4,-26.8],
         [-17.8,8.25,-44.9],[-11,8.25,-44.9],[6.9,8.3,-44.6],[17.9,8.3,-39.5],[-5.2,2.6,-12.6]]
POOL = {'center': [1.8, 0, -6.5], 'outerRadius': 3.45, 'innerRadius': 2.85, 'rimY': .62,
        'waterY': .28, 'approach': [1.8, 0, -2.3], 'dropSocket': [1.8, .95, -3.9], 'impact': [1.8, .28, -4.35]}
VEINS = [
    {'id': 'vein-lower', 'level': 0, 'socket': [-6.4, 1.3, -20.85], 'normal': [0, 0, 1], 'stand': [-6.4, 0, -19.85], 'host': 'middle-west-front'},
    {'id': 'vein-middle', 'level': 3, 'socket': [-8.6, 4.3, -25.45], 'normal': [0, 0, 1], 'stand': [-8.6, 3, -24.45], 'host': 'upper-west-front'},
    {'id': 'vein-upper', 'level': 6, 'socket': [1.5, 7.3, -35.45], 'normal': [0, 0, 1], 'stand': [1.5, 6, -34.45], 'host': 'rear-wall'},
]
def seam_curve(x):return .06*x+.26*math.sin(x*.75)+.09*math.sin(x*1.7)
RACK = {'center': [-8.8, 0, -3.6], 'face': [0, 0, 1], 'approach': [-8.8, 0, -2.55],
        'detectorSocket': [-9.35, 1.05, -3.30], 'pickaxeSocket': [-8.2, 1.05, -3.30]}
ROUTE = [[0, 0, 0], [-5.2, 0, -2], [-8.8, 0, -2.55], [-11.8, 0, -2.55], [-11.8, 0, -9], [-11.8, 3, -21],
         [-11.8, 3, -22.3], [-3.7, 3, -22.3], [7.5, 3, -22.3], [8.8, 3, -22.3], [8.8, 3, -19.7],
         [11.8, 3, -19.7], [11.8, 3, -21], [11.8, 6, -33], [11.8, 6, -34.1], [1.5, 6, -34.1],
         [-8.6, 6, -34.1], [-8.6, 6, -30]]

# Ground-level egress is independent of the raised visitor route. The rear ravine
# and western support slot must remain escapable after a deliberate jump down.
LOW_EXITS = {
    'ravine-to-forecourt': [[2.9,0,-44],[2.9,0,-41.8],[4.8,0,-40.8],[4.8,0,-34],[4.8,0,-26],
        [0,0,-26],[0,0,-19.8],[6.5,0,-15],[6.5,0,-7],[6.5,0,-4],[3,0,-1.1],[0,0,0]],
    'west-support-to-entrance': [[-15.8,0,-23],[-15.8,0,-18],[-15.8,0,-9],[-15.8,0,-2],
        [-12,0,-2],[-5.2,0,-2],[0,0,0]],
}
LOW_PASSAGES = [
    {'id':'ravine-egress','x':[2,7.5],'z':[-41,-33],'clearHeight':2.7},
    {'id':'west-support-egress','x':[-17,-14.6],'z':[-24,-3],'clearHeight':2.25},
]

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def perimeter_map(x,z):
    """Broad erosion of the actual quarry boundary, away from every core join."""
    left=smooth(20,24,-x);right=smooth(20,24,x);back=smooth(44,52,-z)
    return (x+left*(1.8+.9*math.sin(z*.18)+.5*math.sin(z*.41)+8.5*smooth(-6,2,z)+4*smooth(38,52,-z))
             -right*(1.6+1.1*math.sin(z*.19+1.4)+.6*math.sin(z*.4)+7.5*smooth(-24,2,z)+3*smooth(38,52,-z)),
            z+back*(1.2+2*math.sin(x*.13+.5)**2+.8*math.sin(x*.47)+3*(x/24)**2)
             +(left+right)*.8*math.sin(z*.23)+smooth(-3,2,z)*(1.2+.6*math.cos(x*.18)-3.5*(x/24)**2))

def outline():
    boundary=[(x,-52) for x in range(-24,25,4)]+[(24,z) for z in range(-48,3,4)]
    boundary += [(24,2)]+[(x,2) for x in range(20,-25,-4)]+[(-24,z) for z in range(-2,-51,-4)]
    return [[round(a,5),round(b,5)] for a,b in (perimeter_map(x,z) for x,z in boundary)]

def rock_intervals(x,z):
    h=round(height(x,z)/.75)*.75
    for passage in LOW_PASSAGES:
        if passage['x'][0]<x<passage['x'][1] and passage['z'][0]<z<passage['z'][1]:
            return [(passage['clearHeight'],h)] if h>passage['clearHeight'] else []
    return [(0,h)] if h else []

def height(x, z):
    """Closed rock masses stand above the existing island, never excavate it."""
    # A genuinely traversable perimeter gallery, ravine and two rear portals.
    if -21 <= x < -17 and -41 <= z < -29:return 3
    if z < -36:
        if x < -21 or x > 21 or z < -48:
            return 9
        if -8.6 <= x < 7.5 and -46 <= z < -39:return 0
        return 6
    if -36 <= z < -35.6 and 7.5 <= x <= 10.5:return 6
    if x < -17:
        if x < -21 and z < -9:return 6.75
        return 3 if z < -15 else 0
    if -24 <= z < -21 and x < -13.1:return 3
    if -17 <= x < -16:return 3 if z < -15 else 0
    if x > 16:return 0 if z > -36 else 6
    if z > 0:return 0
    if z < -35.6:
        # Broad separated outcrops, with a lower saddle between them.
        return min(9, 7.0 + 1.9*math.exp(-((x+10.5)/3.6)**2)
                   + 1.8*math.exp(-((x-9.8)/3.8)**2)
                   + .95*math.exp(-((x-1.5)/2.2)**2))
    if x < -13.1 and z < -3:
        return min(8.8, max(6.75 if z < -25.6 else .7, 1.0+(-z-3)*.19+1.6*math.exp(-((z+20)/4.8)**2)
                            -.9*math.exp(-((z+27)/3.1)**2)))
    if x > 13.1 and z < -9:
        return min(9, max(6.75 if z < -33 else 1.1, 1.4+(-z-9)*.24+2.0*math.exp(-((z+25.5)/4.3)**2)))
    if -13.1 <= x <= 13.1 and -35.6 <= z < -33:
        return 6
    if -13.1 <= x < -3.7 and -33 <= z < -25.6:
        return 6
    if -13.1 <= x < -3.7 and -25.6 <= z < -21:
        return 3
    if 7.5 <= x <= 13.1 and -23.6 <= z < -18.4:
        return 3
    return 0

def ore_rest(v):
    """Ore centre above the ledge, moved forward for a reachable pickup stance."""
    return [v['socket'][0], v['level']+.70, v['socket'][2]+.30]

def contract():
    ramps = [{**r, 'slopeDeg': math.degrees(math.atan2(r['b'][1]-r['a'][1], math.dist([r['a'][0],r['a'][2]], [r['b'][0],r['b'][2]])))} for r in RAMPS]
    assert all(r['slopeDeg'] <= 16 and r['clearWidth'] >= 2.4 for r in ramps)
    return {'schema': 'alpha-mine-layout-v1', 'units': 'metres', 'axis': {'up': '+Y', 'entranceFace': '+Z', 'depth': '-Z'},
        'root': [0, 0, 0], 'rootMeaning': 'entrance lateral centre / lowest walking level / entrance line',
        'integrationPlacement': {'origin': [-84,1.14,-55], 'yaw': 0, 'providedBy': 'main site audit; expanded NW mainland owned by main'},
        'footprint': {'x': [-24,24], 'z': [-52,2], 'outline':outline()}, 'walkingLevels': [0,3,6], 'maxRockY': 12,
        'entrance': {'center': [0,0,0], 'clearWidth': 8}, 'terrainExcavation': False,
        'staticAsset': '/world/alpha-mine/quarry-static.glb', 'collisionAsset': '/world/alpha-mine/colliders.json',
        'ramps': ramps, 'bridge': BRIDGE, 'route': {'points': ROUTE, 'return': 'reverse; open forecourt loop around basin'},
        'lowExits':LOW_EXITS,'lowPassages':LOW_PASSAGES,
        'gallery': {'ramps':GALLERY_RAMPS,'bridges':GALLERY_BRIDGES,'route':GALLERY_ROUTE,
                    'tunnel':{'axis':'X','x':[-17.2,-9.7],'floorY':6,'centerZ':-43,'clearWidth':3.4,'clearHeight':3.2},
                    'coreConnection':GALLERY_BRIDGES[0],'rearConnection':[8.8,6,-34.1]},
        'lamps':[{'position':p,'color':'#FFC46D','intensity':1.5,'distance':5} for p in LAMPS],
        'veins': [{**v,'oreCatch': {'top': [v['socket'][0],v['level']+.52,v['socket'][2]-.05], 'width': 1.15,'depth':1.15},
                    'oreRest': ore_rest(v)} for v in VEINS], 'basin': POOL, 'toolRack': RACK,
        'socketConvention': 'positions are facility-local glTF coordinates, not guessed bounds centres',
        'surfaceContract': 'ground y=0; intermediate/top walking planes y=3/6; no below-ground excavation or occupied underground void',
        'placementNote': 'root world position set by integration; offset all assets and proxies identically; avoid coplanarity with island ground',
        'batch1Status': 'layout contract; static GLB geometry/visual QA pending',
        'dynamicAssets': {
            'status': 'fixed file/node contract; geometry delivered in batch2',
            'detector': {'url':'/world/alpha-mine/detector.glb','root':'detector','sockets':{'grip_R':'grip_R','scan_origin':'scan_origin'},'scale':1},
            'pickaxe': {'url':'/world/alpha-mine/pickaxe.glb','root':'pickaxe','sockets':{'grip_R':'grip_R','grip_L':'grip_L','head_contact':'head_contact'},'scale':1},
            'ore': {'url':'/world/alpha-mine/ore.glb','root':'ore','sockets':{'grip_R':'grip_R','grip_L':'grip_L','release':'release'},
                    'scale':1,'approxDiameterM':.30,'sharedGeometry':False,'tintMaterial':'ore_mineral',
                    'variants':{'vein-lower':'ore_reversal','vein-middle':'ore_momentum','vein-upper':'ore_lowvol'},
                    'variantSockets':{name:{s:name+'_'+s for s in ['grip_R','grip_L','release']} for name in ['ore_reversal','ore_momentum','ore_lowvol']},
                    'tints':{'vein-lower':'#b7864d','vein-middle':'#5c9b91','vein-upper':'#9ba8b1'}},
            'veins': {'url':'/world/alpha-mine/veins.glb','roots':{v['id']:{'root':v['id'],'placement':v['socket'],'normal':v['normal'],
                'states':{s:v['id']+'_'+s for s in ['intact','cracked','open']},'defaultState':'intact',
                'impactSocket':v['id']+'_impact','oreRestSocket':v['id']+'_oreRest',
                'stateImpactSockets':{s:v['id']+'_'+s+'_impact' for s in ['intact','cracked','open']},
                'oreRestPosition':ore_rest(v),
                'factorId':{'vein-lower':'REVERSAL_5','vein-middle':'ROC20_RANK','vein-upper':'LOW_STD_20'}[v['id']]} for v in VEINS}},
            'toolSocketAxes': {'Y':'along handle toward head','X':'pick tip / scan direction','Z':'right'},
            'pickaxeGripContract': {'rightToHeadM':[.55,.65],'leftAboveRightM':[.14,.20]},
            'socketNamesReason':'independent prop GLBs preserve exact grip_R/L names without loader renaming duplicate nodes'}}

def write_contract():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'layout.json'
    path.write_text(json.dumps(contract(), indent=2)+'\n')
    return path

if __name__ == '__main__':
    print(write_contract())
