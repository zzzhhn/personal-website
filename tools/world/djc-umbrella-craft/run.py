"""One serial Blender job. Invoke only after the coordinator grants heavy work."""
import os, sys, json, uuid, subprocess
from pathlib import Path

HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'docs/world/phase-2-playground/djc-umbrella-craft-20261101'
if '--allow-heavy' not in sys.argv:
    raise SystemExit('No heavy work started. Coordinator heavy permission is required; pass --allow-heavy after permission.')
phase=next((p for p in ('preview','finish','verify') if '--'+p in sys.argv),'preview')
preflight=subprocess.check_output(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],text=True)
print(preflight,flush=True)
resources=json.loads(preflight)
if resources['disk_free_gib']<2 or resources['memory_pressure_level']>=4:
    raise SystemExit('Resource stop threshold reached. No Blender started; notify coordinator.')
LOCK=Path('/tmp/bobby-world-phase2-heavy.lock')
token=json.dumps({'owner':'djc-umbrella-craft','pid':os.getpid(),'token':uuid.uuid4().hex,'phase':phase})
try:
    fd=os.open(LOCK,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
except FileExistsError:
    raise SystemExit('Heavy FILE lock occupied. No Blender started; notify coordinator.')
try:
    with os.fdopen(fd,'w') as handle:handle.write(token)
    with (OUT/('build-'+phase+'.log')).open('w') as log:
        result=subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--factory-startup','--threads','4','--python',str(HERE/'build.py'),'--',phase],stdout=log,stderr=subprocess.STDOUT,timeout=600)
    raise SystemExit(result.returncode)
finally:
    if LOCK.exists() and LOCK.read_text()==token:LOCK.unlink()
