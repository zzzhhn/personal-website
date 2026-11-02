"""Read-only frozen identity and local JS reference graph check; writes one receipt."""
from pathlib import Path, PurePosixPath
from datetime import datetime
from zoneinfo import ZoneInfo
from collections import deque
import hashlib, html, json, posixpath, re, subprocess, sys

receipt = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
author = Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch5')
release = Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release')
r = json.loads(receipt.read_text())
root = Path(r['build']).resolve()
sha = lambda data: hashlib.sha256(data).hexdigest()
errors, files, sources = [], [], []
for name, value in r['files'].items():
    expected = value if isinstance(value, str) else value['sha256']
    p = root / name
    actual = sha(p.read_bytes()) if p.is_file() else None
    files.append(dict(path=name, expectedSHA256=expected, actualSHA256=actual, matched=actual == expected))
    if actual != expected:
        errors.append('frozen:' + name)
for name, expected in r['source'].items():
    path = 'src/components/world/' + name
    a, b = sha((author / path).read_bytes()), sha((release / path).read_bytes())
    sources.append(dict(path=path, expectedSHA256=expected, authorSHA256=a, releaseSHA256=b, matched=a == b == expected))
    if not a == b == expected:
        errors.append('source:' + name)
baseline = sha(subprocess.check_output(['git', '-C', str(author), 'show', r['base'] + ':src/components/world/WorldTerrain.tsx']))
if baseline != r['source']['WorldTerrain.tsx']:
    errors.append('baseline-terrain')

# Inspect actual HTML and recursively resolve local literal JS references, including
# static/dynamic imports, workers and preload-map literals. This intentionally checks
# a superset of executable import edges; it does not evaluate arbitrary JS expressions.
entry = 'world/index.html'
html_source = html.unescape((root / entry).read_text())
direct = sorted(set(re.findall(r'/_astro/[^\s"<>]+?\.m?js', html_source)))
quoted_js = re.compile(r'''["']((?:\.{1,2}/|/|_astro/)[^\s"'\\]+?\.m?js(?:[?#][^"'\\]*)?)["']''')
queue, graph, missing, hashes, nonliteral = deque(), {}, [], {}, []
def resolve(source, ref):
    ref = ref.split('?', 1)[0].split('#', 1)[0]
    target = ref.lstrip('/') if ref.startswith('/') or ref.startswith('_astro/') else posixpath.join(posixpath.dirname(source), ref)
    return posixpath.normpath(target)
graph[entry] = [resolve(entry, ref) for ref in direct]
queue.extend(graph[entry])
while queue:
    name = queue.popleft()
    if name in graph:
        continue
    path = root / name
    if '..' in PurePosixPath(name).parts or not path.is_file():
        missing.append(name)
        graph[name] = []
        continue
    source = path.read_text()
    hashes[name] = sha(path.read_bytes())
    graph[name] = sorted(set(resolve(name, ref) for ref in quoted_js.findall(source)))
    queue.extend(graph[name])
    for match in re.finditer(r'\bimport\s*\(\s*(?!["\'])', source):
        nonliteral.append(dict(module=name, offset=match.start(), snippet=source[match.start():match.start()+90]))
missing = sorted(set(missing))
errors.extend('entry-graph-missing:' + name for name in missing)
paths = {}
for target in r['runtimeBundles']:
    pending = deque([[entry]])
    seen = set()
    while pending:
        chain = pending.popleft()
        name = chain[-1]
        if name == target:
            paths[target] = chain
            break
        if name in seen:
            continue
        seen.add(name)
        pending.extend(chain + [child] for child in graph.get(name, []))
    if target not in paths:
        errors.append('runtime-not-reachable:' + target)
if not any('WorldApp.' in name for name in graph.get(entry, [])):
    errors.append('no-world-app-entry')
if len(files) != 60:
    errors.append('unexpected-file-count:' + str(len(files)))

result = dict(
    verifiedAt=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
    status='IDENTITY_AND_ENTRY_GRAPH_PASS' if not errors else 'FAIL',
    receiptPath=str(receipt), receiptSHA256=sha(receipt.read_bytes()), frozenRoot=str(root),
    sourceCommit=r.get('sourceCommit'),
    observedHeads={str(p): subprocess.check_output(['git', '-C', str(p), 'rev-parse', 'HEAD'], text=True).strip() for p in [author, release]},
    frozenMatched=sum(f['matched'] for f in files), frozenTotal=len(files),
    sourceMatchedBothTrees=sum(s['matched'] for s in sources), sourceTotal=len(sources),
    baselineTerrainSHA256=baseline, files=files, sources=sources,
    entryGraph=dict(status='PASS' if not missing and paths and not any(e.startswith('no-world') for e in errors) else 'FAIL',
                    directHTMLModules=graph[entry], runtimePaths=paths, checkedLocalJSFiles=len(hashes),
                    missing=missing, nonliteralImports=nonliteral, references=graph, hashes=hashes,
                    limitation='Local literal JS reference existence and hashes only; nonliteral imports reported rather than evaluated; no WebGL, gameplay, asset loading or performance claim.'),
    browserRuntimeVerified=False, errors=errors,
    scope='Independent lightweight identity and actual local entry-reference graph verification. No service, browser, lock, build or test suite started.')
output.write_text(json.dumps(result, indent=2))
print(json.dumps({k: result[k] for k in ['status', 'frozenMatched', 'frozenTotal', 'sourceMatchedBothTrees', 'sourceTotal', 'errors']}))
print(json.dumps({k: result['entryGraph'][k] for k in ['directHTMLModules', 'runtimePaths', 'checkedLocalJSFiles', 'missing', 'nonliteralImports']}))
if errors:
    raise SystemExit(1)
