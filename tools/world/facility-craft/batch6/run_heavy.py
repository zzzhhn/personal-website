"""Exclusive heavy-job lease. Never overwrites an existing owner's lock."""
from pathlib import Path
import os, sys, json, time, subprocess, uuid

lock = Path('/tmp/bobby-world-phase2-heavy.lock')
token = uuid.uuid4().hex
owner = {'owner':'01a17194-2fce-7a21-978a-e441e9e39765', 'token':token,
         'purpose':sys.argv[1], 'pid':os.getpid(), 'started':time.time()}
try:
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
except FileExistsError:
    print('LOCK_BUSY '+lock.read_text()[:500]);sys.exit(75)
with os.fdopen(fd,'w') as file: json.dump(owner,file)
try:
    child = subprocess.Popen(sys.argv[2:])
    owner['childPid'] = child.pid
    lock.write_text(json.dumps(owner))
    sys.exit(child.wait())
finally:
    if lock.exists() and json.loads(lock.read_text()).get('token') == token: lock.unlink()
