"""Run only after primary grants the heavy slot. Never starts a browser."""
import os, subprocess, sys
from pathlib import Path

tools=Path(__file__).resolve().parent
repo=tools.parents[2]
out=repo/'docs/world/phase-2-playground/djc-pool-lantern-craft-20261101'
print(subprocess.check_output(['/usr/bin/python3','/Users/a22309/.local/bin/codex-resource-preflight.py'],text=True),flush=True)
lock=Path('/tmp/bobby-world-phase2-heavy.lock')
try:
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
except FileExistsError:
    raise SystemExit('Heavy lock occupied; stop and notify primary.')
identity=('djc-pool-lantern-craft pid='+str(os.getpid())).encode()
os.write(fd,identity);os.close(fd)
phase='evening' if '--evening' in sys.argv else 'finish' if '--finish' in sys.argv else 'preview'
try:
    with (out/('build-'+phase+'.log')).open('w') as log:
        result=subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender','--background','--factory-startup','--threads','3','--python',str(tools/'build.py'),'--',phase],stdout=log,stderr=subprocess.STDOUT)
    text=(out/('build-'+phase+'.log')).read_text()
    if result.returncode or (phase.upper()+'_OK') not in text:
        raise SystemExit(result.returncode or 1)
finally:
    if lock.exists() and lock.read_bytes()==identity:lock.unlink()
