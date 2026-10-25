"""Alpha mine contract in glTF-local metres: +Y up, entrance +Z, depth -Z.
Pure Python; the model, proxy builder and runtime manifest share these exact values.
"""
from pathlib import Path
import json, math

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/world/alpha-mine'
XS = [-16, -14.6, -13.1, -10.5, -8.6, -6.4, -3.7, -1, 2, 5, 7.5, 10.5, 13.1, 14.6, 16]
ZS = [-36, -35.6, -33, -30, -27.8, -25.6, -23.6, -21, -18.4, -16, -12, -9, -6, -3, 0]

RAMPS = [
    {'id': 'ramp-west-0-3', 'a': [-11.8, 0, -9], 'b': [-11.8, 3, -21], 'deckWidth': 2.6, 'clearWidth': 2.4},
    {'id': 'ramp-east-3-6', 'a': [11.8, 3, -21], 'b': [11.8, 6, -33], 'deckWidth': 2.6, 'clearWidth': 2.4},
]
BRIDGE = {'id': 'bridge-middle', 'a': [-3.7, 3, -22.3], 'b': [7.5, 3, -22.3], 'deckWidth': 2.6, 'clearWidth': 2.4}
POOL = {'center': [1.8, 0, -6.5], 'outerRadius': 3.45, 'innerRadius': 2.85, 'rimY': .62,
        'waterY': .28, 'approach': [1.8, 0, -2.3], 'dropSocket': [1.8, .95, -3.9], 'impact': [1.8, .28, -4.35]}
VEINS = [
    {'id': 'vein-lower', 'level': 0, 'socket': [-6.4, 1.3, -20.85], 'normal': [0, 0, 1], 'stand': [-6.4, 0, -19.85], 'host': 'middle-west-front'},
    {'id': 'vein-middle', 'level': 3, 'socket': [-8.6, 4.3, -25.45], 'normal': [0, 0, 1], 'stand': [-8.6, 3, -24.45], 'host': 'upper-west-front'},
    {'id': 'vein-upper', 'level': 6, 'socket': [1.5, 7.3, -35.45], 'normal': [0, 0, 1], 'stand': [1.5, 6, -34.45], 'host': 'rear-wall'},
]
RACK = {'center': [-8.8, 0, -3.6], 'face': [0, 0, 1], 'approach': [-8.8, 0, -2.55],
        'detectorSocket': [-9.35, 1.05, -3.30], 'pickaxeSocket': [-8.2, 1.05, -3.30]}
ROUTE = [[0, 0, 0], [-5.2, 0, -2], [-8.8, 0, -2.55], [-11.8, 0, -2.55], [-11.8, 0, -9], [-11.8, 3, -21],
         [-11.8, 3, -22.3], [-3.7, 3, -22.3], [7.5, 3, -22.3], [8.8, 3, -22.3], [8.8, 3, -19.7],
         [11.8, 3, -19.7], [11.8, 3, -21], [11.8, 6, -33], [11.8, 6, -34.1], [1.5, 6, -34.1],
         [-8.6, 6, -34.1], [-8.6, 6, -30]]

def height(x, z):
    """Closed rock masses stand above the existing island, never excavate it."""
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
        'integrationPlacement': {'origin': [60,1.14,-55], 'yaw': 0, 'providedBy': 'main site audit; foundation/sea mask owned by main'},
        'footprint': {'x': [-16,16], 'z': [-36,0]}, 'walkingLevels': [0,3,6], 'maxRockY': 9,
        'entrance': {'center': [0,0,0], 'clearWidth': 8}, 'terrainExcavation': False,
        'staticAsset': '/world/alpha-mine/quarry-static.glb', 'collisionAsset': '/world/alpha-mine/colliders.json',
        'ramps': ramps, 'bridge': BRIDGE, 'route': {'points': ROUTE, 'return': 'reverse; open forecourt loop around basin'},
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
                    'scale':1,'approxDiameterM':.30,'sharedGeometry':True,'tintMaterial':'ore_mineral',
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
