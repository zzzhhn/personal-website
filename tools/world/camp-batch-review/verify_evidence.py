"""Check the captured camp evidence, not a substitute for visual/play acceptance."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DOC = ROOT / 'docs/world/phase-2-playground/camp-batch-20261107'
EVIDENCE = DOC / 'evidence'


def read(name):
    return json.loads((EVIDENCE / name).read_text())


def facts_equal(a, b, tolerance=1e-6):
    for key in ('shot', 'fov', 'exposure', 'canvas', 'dpr', 'time'):
        assert a[key] == b[key], (key, a[key], b[key])
    for key in ('camera', 'quaternion'):
        assert max(abs(x-y) for x, y in zip(a[key], b[key])) < tolerance, key


views = ('overview-day', 'overview-night', 'shelter-day', 'flags-day',
         'books-day', 'tools-day', 'lamps-day', 'lamps-night')
for view in views:
    sizes = []
    for variant in ('before', 'after'):
        with Image.open(EVIDENCE / f'{variant}-{view}.jpg') as image:
            assert image.format == 'JPEG'
            sizes.append(image.size)
    assert sizes[0] == sizes[1] == (1710, 875), (view, sizes)
    before_name = f'before-{view}.json'
    if view.startswith('overview-'):
        before_name = f'before-perf-{view.split("-")[-1]}.json'
    facts_equal(read(before_name), read(f'after-{view}.json'))

manifest = json.loads((DOC / 'candidate.json').read_text())
for path, expected in manifest['source'].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path
for path, expected in manifest['assets'].items():
    data = (ROOT / path).read_bytes()
    assert len(data) == expected['bytes'], path
    assert hashlib.sha256(data).hexdigest() == expected['sha256'], path

def colliders(name):
    return sorted([{k: v for k, v in c.items() if k not in ('key', 'label')}
                   for c in read(name)['colliders']], key=lambda c: (c['id'], c['instance'], c['part']))

assert colliders('before-assets.json') == colliders('after-assets.json')
for name in ('walk-tent-approach', 'walk-tent-inside', 'walk-tent-outside', 'walk-exit'):
    assert read(f'{name}.json')['grounded'], name
assert read('interaction-books.json')['motion']['page']['visible']
assert abs(read('interaction-tools.json')['motion']['tools'][2]) > .05
assert all(abs(f['rotation'][0]) > .3 for f in read('interaction-flags.json')['motion']['flags'])
assert read('pause-start.json')['wind'] == read('pause-end.json')['wind']
assert read('pause-start.json')['motion']['flags'] == read('pause-end.json')['motion']['flags']

performance = {}
for view in ('day', 'night', 'play'):
    suffix = '-recheck' if view != 'play' else ''
    before = read(f'before-perf-{view}{suffix}.json')
    after = read(f'after-perf-{view}.json')
    facts_equal(before, after, tolerance=.01 if view == 'play' else 1e-6)
    assert before['frameMs']['n'] == after['frameMs']['n'] == 360
    performance[view] = {'before': before['frameMs'], 'after': after['frameMs'],
                         'drawCalls': [before['calls']['p50'], after['calls']['p50']],
                         'triangles': [before['triangles']['p50'], after['triangles']['p50']]}

result = {'pairedViews': len(views), 'unchangedColliders': True,
          'walkingAndInteractions': True, 'pauseStopsWind': True,
          'sourceAndAssetsMatch': True, 'performance': performance,
          'boundary': 'Local matched captures; visual acceptance remains with the user. Not whole-island performance certification.'}
(DOC / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
