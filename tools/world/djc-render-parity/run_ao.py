"""Serialized, ten-minute bounded asset AO job."""
import os, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parent
out=root.parents[2]/'docs/world/phase-2-playground/djc-render-parity-20261101/asset-ao'
out.mkdir(parents=True,exist_ok=True)
print(subprocess.check_output(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],text=True),flush=True)
lock=Path('/tmp/bobby-world-phase2-heavy.lock')
try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
except FileExistsError:raise SystemExit('Heavy lock occupied; stop and notify primary.')
os.write(fd,('daybed AO pid='+str(os.getpid())).encode());os.close(fd)
try:
    with (out/'bake.log').open('w') as log:
        script='verify_existing_ao.py' if '--verify-existing' in sys.argv else 'prepare_asset_ao.py'
        args=['--uv-probe'] if '--uv-probe' in sys.argv else []
        result=subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--factory-startup','--threads','4','--python',str(root/script),'--',*args],stdout=log,stderr=subprocess.STDOUT,timeout=600)
    raise SystemExit(result.returncode)
finally:lock.unlink(missing_ok=True)
