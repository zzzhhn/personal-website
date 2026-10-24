"""Read-only Markdown/JSON inventory parity and produced-file hash verification."""
import hashlib, json, os, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
assets = json.loads((ROOT / 'docs/world/assets-v1.json').read_text())
markdown = (ROOT / 'docs/world/资产清单-v1.md').read_text()
rows = {}
for line in markdown.splitlines():
    cells = [x.strip() for x in re.split(r'(?<!\\)\|', line)]
    if len(cells) > 2 and re.fullmatch(r'[GCTPF]\d{2}', cells[1]):
        assert cells[1] not in rows, 'duplicate Markdown ID ' + cells[1]
        rows[cells[1]] = cells[1:-1]
assert len({a['id'] for a in assets}) == len(assets), 'duplicate JSON ID'
assert set(rows) == {a['id'] for a in assets}, 'ID mismatch'
failures = []
checked_hashes = []
for asset in assets:
    row = rows[asset['id']]
    expected = [asset['id'], asset['zone'], f"{asset['name']} × {asset['count']}", asset['source'], asset['triangles'], asset['materialRole'], asset['physics'], f"[{asset['reference']} #{asset['id']}](reference-crops.html#{asset['id']})", asset['note']]
    for index, (actual, want) in enumerate(zip(row, expected)):
        if actual != str(want).replace('|', r'\|'):
            failures.append({'id': asset['id'], 'column': index, 'markdown': actual, 'json': want})
    if len(row) != len(expected): failures.append({'id': asset['id'], 'columns': len(row)})
    production = asset.get('production', {})
    if production.get('glb') and production.get('sha256'):
        digest = hashlib.sha256((ROOT / production['glb']).read_bytes()).hexdigest()
        if digest != production['sha256']: failures.append({'id': asset['id'], 'hash': 'mismatch'})
        checked_hashes.append(asset['id'])
report = {'assetCount': len(assets), 'markdownCount': len(rows), 'checkedHashes': checked_hashes, 'failures': failures, 'passed': not failures}
output = ROOT / os.environ.get('WORLD_INVENTORY_REPORT', 'docs/world/quality-v2/inventory-check.json')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(1 if failures else 0)
