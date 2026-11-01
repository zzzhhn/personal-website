"""Root-authorized serialized heavy slot only. Own lock, never evict another owner."""
import os,sys,json,subprocess,secrets
from pathlib import Path
TOOLS=Path(__file__).resolve().parent;LOCK=Path('/tmp/bobby-world-phase2-heavy.lock')
preflight=subprocess.run(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],capture_output=True,text=True,check=True);print(preflight.stdout.strip(),flush=True);state=json.loads(preflight.stdout)
if state.get('disk_free_gib',0)<2 or state.get('memory_pressure_level',4)>=4:raise SystemExit('Stop threshold: free disk <2GiB or pressure >=4')
owner=dict(owner='ibd_static_craft',pid=os.getpid(),token=secrets.token_hex(12));fd=os.open(LOCK,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
try:
    os.write(fd,json.dumps(owner).encode());os.close(fd)
    raise SystemExit(subprocess.run(['/usr/bin/nice','-n','10','/Applications/Blender.app/Contents/MacOS/Blender','--background','--threads','3','--python-exit-code','1','--python',str(TOOLS/'build.py')]).returncode)
finally:
    if LOCK.exists() and json.loads(LOCK.read_text())==owner:LOCK.unlink()
