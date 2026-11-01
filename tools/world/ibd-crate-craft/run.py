"""Serialized, task-owned Blender launch. Run only in root-authorized heavy window."""
import os,sys,json,subprocess
from pathlib import Path
TOOLS=Path(__file__).resolve().parent
LOCK=Path('/tmp/bobby-world-phase2-heavy.lock')
owner=dict(owner='crate_craft',pid=os.getpid(),phase=sys.argv[1] if len(sys.argv)>1 else 'preview')
preflight=subprocess.run(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],capture_output=True,text=True,check=True)
print(preflight.stdout.strip(),flush=True)
resources=json.loads(preflight.stdout)
if resources.get('disk_free_gib',0)<2 or resources.get('memory_pressure_level',4)>=4:
    raise SystemExit('Root stop threshold reached: disk <2GiB or pressure >=4. No additional heavy load started.')
try:
    fd=os.open(LOCK,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
except FileExistsError:
    raise SystemExit('Shared heavy lock is occupied; leave existing owner untouched.')
try:
    os.write(fd,json.dumps(owner).encode());os.close(fd)
    result=subprocess.run(['/usr/bin/nice','-n','10','/Applications/Blender.app/Contents/MacOS/Blender',
      '--background','--threads','3','--python',str(TOOLS/'build.py'),'--',owner['phase']])
    if result.returncode==0 and owner['phase']=='finish':
        subprocess.run([sys.executable,str(TOOLS/'finalize-manifest.py')],check=True)
    raise SystemExit(result.returncode)
finally:
    if LOCK.exists():
        try:current=json.loads(LOCK.read_text())
        except (ValueError,OSError):current=None
        if current==owner:LOCK.unlink()
