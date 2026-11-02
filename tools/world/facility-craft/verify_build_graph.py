"""Verify generated world HTML reaches its actual client entry and runtime module."""
from pathlib import Path
import hashlib
import json
import re
import sys

root = Path(sys.argv[1]).resolve()
page = root/'world/index.html'
html = page.read_text()
entry = re.search(r'component-url="([^"]*WorldApp[^\"]*\.js)"',html)
assert entry, 'No WorldApp client entry in actual HTML'
entry = root/entry.group(1).lstrip('/')
assert entry.is_file(), f'HTML references missing WorldApp: {entry}'
pending = [entry]
seen = {}
while pending:
    path = pending.pop()
    if path in seen:
        continue
    assert path.is_file(), f'Missing reachable module: {path}'
    data = path.read_bytes()
    seen[path] = hashlib.sha256(data).hexdigest()
    for ref in re.findall(r'''["']((?:\./|/_astro/)[^"']+\.js)["']''',data.decode()):
        target = root/ref.lstrip('/') if ref.startswith('/') else (path.parent/ref).resolve()
        assert target.is_relative_to(root), target
        assert target.is_file(), f'{path.name} references missing {ref}'
        pending.append(target)
runtimes = [path for path in seen if path.name.startswith('WorldRuntime.')]
assert len(runtimes) == 1, f'Expected one reachable runtime: {runtimes}'
report = {'build':str(root),'htmlSHA256':hashlib.sha256(page.read_bytes()).hexdigest(),
          'entry':str(entry.relative_to(root)),'runtime':str(runtimes[0].relative_to(root)),
          'reachableModules':{str(p.relative_to(root)):h for p,h in seen.items()}}
print(json.dumps(report,indent=2))
