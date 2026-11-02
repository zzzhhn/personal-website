"""Audit retained actual input, LOD, wind and bounded frame-window receipts."""
from pathlib import Path
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'docs/world/phase-2-playground/asset-batch5-20261102/runtime'
read = lambda n: json.loads((RUN / n).read_text())
report = {'scope': 'Actual browser receipts from frozen R3/R4. Fourteen-item R5 keeps the same six asset adapter sources and ten GLBs; rejected ground is excluded.'}
interactions = []
for part, serial in [('guitar', 57), ('dumbbell', 58), ('wok', 59), ('suitcase', 60)]:
    name = f'candidate-interact-camp-about-{part}-interaction-{serial}.json'
    d = read(name)
    assert d['event']['trusted'] and d['event']['code'] == 'KeyE'
    assert d['before']['settings']['nearbyInteract']['id'] == f'camp-about-{part}'
    assert all(part in s['camp']['feedback'] for s in d['samples'][:2])
    assert not d['samples'][2]['camp']['feedback']
    assert d['samples'][0]['settings']['card']['kind'] == 'about'
    interactions.append({'receipt': name, 'trustedKeyE': True, 'feedbackActiveThenRecovered': True})
for seat, start in [('street-bench-24', 61), ('street-shelter-seat', 63)]:
    for offset in [0, 1]:
        name = f'candidate-interact-{seat}-interaction-{start+offset}.json'
        d = read(name)
        assert d['event']['trusted'] and d['event']['code'] == 'KeyE'
        assert bool(d['before']['settings']['seat']) == bool(offset)
        assert all(bool(s['settings']['seat']) == (not offset) for s in d['samples'])
        if offset:
            assert d['samples'][-1]['grounded']
        interactions.append({'receipt': name, 'trustedKeyE': True, 'seatState': 'sit' if not offset else 'stand'})
report['interactions'] = interactions
report['cardTiming'] = 'About card opens at the first 60ms sample. A subsequent actual E closed the last three cards while their feedback recovery probe continued; later card state is not required to stay open.'
report['seatLimit'] = 'State transition and grounded exit verified. Shelter sit screenshot is camera-occluded; it does not prove a visually correct seated pose.'

lods = []
for label, level in [('near', 0), ('far', 1)]:
    name = f'candidate-v-tree-lod-{label}-noon-{9 if level == 0 else 11}.json'
    d = read(name)
    assert len(d['tree']) == 4
    active = [p for p in d['tree'] if p['visible']]
    assert len(active) == 2 and all(p['level'] == level and p['count'] == 1 for p in active)
    assert all(p['count'] == 0 for p in d['tree'] if not p['visible'])
    for p in d['tree']:
        assert all(p['wind'][k] for k in ['attribute', 'depth', 'distance'])
        assert p['wind']['itemSize'] == 4
        for a, b in zip(p['actualRootMatrices'], p['placementRootMatrices']):
            assert max(abs(x-y) for x,y in zip(a,b)) < 1e-5
    lods.append({'receipt': name, 'rootDistanceM': d['configuration']['expectedRootDistanceM'],
                 'activeLevel': level, 'activeTriangles': sum(p['triangles'] for p in active)})
report['treeLOD'] = lods
motion = read('candidate-n-camp-motion-14.json')
a,b = motion['before'], motion['after']
assert not a['settings']['paused'] and not b['settings']['paused']
assert not a['settings']['shot'] and not b['settings']['shot']
assert math.dist(a['camera']['position'],b['camera']['position']) < 1e-8
wind = b['loop']['windTime'] - a['loop']['windTime']
assert .5 < wind < .8 and b['loop']['frame'] > a['loop']['frame']
report['treeWind'] = {'receipt': 'candidate-n-camp-motion-14.json', 'windSeconds': wind,
                      'frames': b['loop']['frame']-a['loop']['frame'], 'visualROI': 'tree-wind-visual-audit-r3.json'}

p0 = read('candidate-n-grass-noon-66.json')['player']
p1 = read('candidate-n-grass-noon-68.json')['player']
trail = [read(f'candidate-n-grass-trail-{i}.json')['amount'] for i in [65,67,69]]
assert math.dist(p0,p1) > 3 and trail[0] > trail[1] > trail[2] == 0
report['trample'] = {'movementKey': 'Actual W held 1200ms', 'distanceM': math.dist(p0,p1),
                     'amounts': trail, 'scope': 'Existing trample behavior retained in R4; rejected ground appearance is not accepted by this check.'}

windows = {}
for name in ['legacy-n-camp-sample-6.json', 'legacy-n-patches-sample-12.json',
             'candidate-n-patches-sample-6.json', 'legacy-n-street-sample-6.json',
             'candidate-n-street-sample-10.json']:
    d = read(name)
    assert len(d['samples']) == 300 and d['warmupDistinctFrames'] == 90
    for s in [d['before'],d['after']]:
        assert s['grounded'] and not s['settings']['paused'] and not s['settings']['shot']
        assert s['renderInfo']['drawingBuffer'] == [1710,931] and s['renderInfo']['pixelRatio'] == 1
        assert s['settings']['quality'] == 'balanced' and s['settings']['weather'] == 'clear'
        assert s['settings']['worldMinutes'] == 720 and not s['settings']['timeRunning']
        assert s['loop']['mode'] == 'always'
    span = max(math.dist(s['camera'],d['samples'][0]['camera']) for s in d['samples'])
    assert span < 1e-8
    assert all(len({s[k] for s in d['samples']}) == 1 for k in ['calls','triangles'])
    assert all(d['before']['stats'][k] == d['after']['stats'][k] for k in ['geometries','textures','programs'])
    windows[name] = {**d['summary'], 'calls': d['samples'][0]['calls'],
                     'triangles': d['samples'][0]['triangles'], 'cameraSpanM': span}
report['validWindows'] = windows
report['performanceConclusion'] = 'Frame-time acceptance unresolved. Sequential single windows with host variation cannot isolate asset cost. Camp candidate never yielded a final stable complete window: initial geometry changed; final attempt was interrupted and no sample was saved. Stop condition reached; no best-of selection.'
report['groundWindowScope'] = 'Patches pair measures rejected R4 ground only, not fourteen-item R5 terrain.'
(RUN / 'behavior-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'trustedInteractions':len(interactions),'treeLevels':len(lods),'validWindows':len(windows),'performance':'unresolved'}))
