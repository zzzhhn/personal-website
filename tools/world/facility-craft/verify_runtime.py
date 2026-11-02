"""Check actual saved browser receipts against the declared cameras and frozen output."""
from pathlib import Path
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/world/phase-2-playground/asset-batch5-20261102'
RUN = OUT / 'runtime'
views = json.loads((OUT / 'views.json').read_text())
build = json.loads((OUT / 'build-r4.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_locations = {}
for name, digest in build['source'].items():
    # R4's ground was rejected after review. Its evidence retains that version;
    # the fourteen-item product restores the baseline terrain instead.
    source = (OUT / 'rejected-ground-r4' / name if name == 'WorldTerrain.tsx'
              else ROOT / 'src/components/world' / name)
    assert sha(source) == digest, f'Changed R4 evidence source: {name}'
    source_locations[name] = str(source.relative_to(ROOT))
for name, digest in build['files'].items():
    assert sha(Path(build['build']) / name) == digest, f'Changed frozen output: {name}'

receipts = []
for p in RUN.glob('*.json'):
    d = json.loads(p.read_text())
    if 'settings' in d and d.get('active') and 'review=r4' in d.get('url', ''):
        receipts.append((p, d))

names = ['tree-medium', 'tree-close', 'patches-medium', 'patches-close',
         'bench', 'shelter', 'lamp', 'signal', 'bin', 'roadblock', 'seawallBay',
         'timberRail', 'c12', 'c13', 'c14', 'c15', 'c16']
selected = {}
for name in names:
    key = 'v-' + name
    for mode in ['legacy', 'candidate']:
        for time in ['noon', 'night']:
            options = [(p, d) for p, d in receipts if d['active'] == key and d['mode'] == mode
                       and d['settings']['light'] == time]
            assert options, f'Missing actual saved receipt: {mode}/{key}/{time}'
            p, d = max(options, key=lambda item: item[0].stat().st_mtime_ns)
            image = RUN / f'{mode}-{key}-{time}.png'
            assert image.exists(), f'Missing screenshot: {image.name}'
            assert image.stat().st_mtime > p.stat().st_mtime - 1, f'Screenshot predates receipt: {image.name}'
            assert d['configuration'] == views[key], f'Configuration changed: {p.name}'
            assert d['stage'] == 'art' and not d['settings']['paused']
            assert not d['settings']['timeRunning'] and d['settings']['weather'] == 'clear'
            assert d['settings']['quality'] == 'balanced' and d['settings']['shot'] == 'camp-qa-close'
            assert d['renderInfo']['drawingBuffer'] == [1710, 931]
            assert d['renderInfo']['cssSize'] == [1710, 931]
            assert d['renderInfo']['pixelRatio'] == 1 and d['camera']['fov'] == 50
            assert d['settings']['worldMinutes'] == (720 if time == 'noon' else 0)
            assert abs(d['loop']['night'] - (0 if time == 'noon' else 1)) < .001
            assert max(abs(a-b) for a, b in zip(d['camera']['position'], views[key]['position'])) < 1e-5
            dx = views[key]['target'][0] - views[key]['position'][0]
            dz = views[key]['target'][2] - views[key]['position'][2]
            direction = [dx / math.hypot(dx, dz), dz / math.hypot(dx, dz)]
            assert max(abs(a-b) for a, b in zip(d['camera']['forwardGround'], direction)) < 1e-5
            assert not [n for n in d['nodes'] if 'fallback' in n or 'loading' in n]
            selected[image.name] = {'receipt': p.name, 'pngSHA256': sha(image),
                                    'cameraPosition': d['camera']['position'],
                                    'configuration': d['configuration'], 'night': d['loop']['night']}

report = {'frozenFilesMatched': len(build['files']), 'sourceFilesMatched': len(build['source']),
          'sourceLocations': source_locations,
          'screenshots': selected, 'count': len(selected),
          'scope': 'Frozen R4 evidence identity. Ground R4 was rejected and is archived; the fourteen-item product excludes it. Primary image inspection and human approval are separate.'}
(RUN / 'visual-audit-r4.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'verifiedScreenshots': len(selected), 'frozenFilesMatched': len(build['files'])}))
