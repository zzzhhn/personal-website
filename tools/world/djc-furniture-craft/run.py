"""One bounded furniture Blender job, after coordinator grants the heavy window."""
import json, os, subprocess, sys, uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'docs/world/phase-2-playground/djc-furniture-craft-20261101'
if '--allow-heavy' not in sys.argv:
    raise SystemExit('Heavy window is not granted. No Blender started.')
resources = json.loads(subprocess.check_output(['/usr/bin/python3', '/Users/a22309/.local/bin/codex-resource-preflight.py'], text=True))
print(json.dumps(resources), flush=True)
if resources['disk_free_gib'] < 2 or resources['memory_pressure_level'] >= 4:
    raise SystemExit('Resource stop threshold reached. No Blender started.')
lock = Path('/tmp/bobby-world-phase2-heavy.lock')
token = json.dumps({'owner': 'djc-furniture-craft', 'pid': os.getpid(), 'token': uuid.uuid4().hex})
try:
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
except FileExistsError:
    raise SystemExit('Heavy FILE lock occupied. No Blender started.')
try:
    with os.fdopen(fd, 'w') as handle:
        handle.write(token)
    with (OUT / 'build.log').open('w') as log:
        result = subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender', '--background', '--factory-startup', '--threads', '3', '--python', str(HERE / 'build.py')], stdout=log, stderr=subprocess.STDOUT, timeout=900)
    raise SystemExit(result.returncode)
finally:
    if lock.exists() and lock.read_text() == token:
        lock.unlink()
