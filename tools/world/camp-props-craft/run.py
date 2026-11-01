"""Serial bounded Blender job, only after coordinator grants the window."""
import os,sys,json,uuid,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
OUT=HERE.parents[2]/'docs/world/phase-2-playground/camp-props-craft-20261101'
if '--allow-heavy' not in sys.argv:raise SystemExit('No Blender started; coordinator heavy window required.')
resource=json.loads(subprocess.check_output(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],text=True));print(json.dumps(resource),flush=True)
if resource['disk_free_gib']<2 or resource['memory_pressure_level']>=4:raise SystemExit('Resource stop threshold. No Blender started.')
lock=Path('/tmp/bobby-world-phase2-heavy.lock');token=json.dumps(dict(owner='camp-props-craft',pid=os.getpid(),token=uuid.uuid4().hex))
try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
except FileExistsError:raise SystemExit('Heavy FILE lock occupied. No Blender started.')
try:
 with os.fdopen(fd,'w') as f:f.write(token)
 OUT.mkdir(parents=True,exist_ok=True)
 c05='--c05-refine' in sys.argv;args=['--','--c05-refine','--c05-only'] if c05 else []
 if '--fresh-only' in sys.argv:args.append('--fresh-only')
 logname='build-c05-r2-final.log' if '--fresh-only' in sys.argv else ('build-c05-r2.log' if c05 else 'build.log')
 with (OUT/logname).open('w') as log:
  result=subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--factory-startup','--threads','3','--python-exit-code','1','--python',str(HERE/'build.py'),*args],stdout=log,stderr=subprocess.STDOUT,timeout=900)
 raise SystemExit(result.returncode)
finally:
 if lock.exists() and lock.read_text()==token:lock.unlink()
