import os, subprocess, sys, json
from pathlib import Path

tools = Path(__file__).resolve().parent
repo = tools.parents[2]
out = repo / 'docs/world/phase-2-playground/djc-daybed-craft-20261101'
out.mkdir(parents=True, exist_ok=True)
preflight = subprocess.check_output(['/usr/bin/python3', '/Users/a22309/.local/bin/codex-resource-preflight.py'], text=True)
print(preflight, flush=True)
lock = Path('/tmp/bobby-world-phase2-heavy.lock')
try:
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
except FileExistsError:
    raise SystemExit('Heavy lock occupied. Stop and notify primary; do not wait.')
os.write(fd, ('djc-daybed-craft pid=' + str(os.getpid())).encode()); os.close(fd)
phase = 'verify' if '--verify-only' in sys.argv else 'finish' if '--finish' in sys.argv else 'preview'
try:
    log = (out / ('build-' + phase + '.log')).open('w')
    result = subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender', '--background', '--factory-startup', '--threads', '4', '--python', str(tools / 'build.py'), '--', phase], stdout=log, stderr=subprocess.STDOUT)
    raise SystemExit(result.returncode)
finally:
    lock.unlink(missing_ok=True)
