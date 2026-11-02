"""Single serial heavy window. Call through batch6/run_heavy.py after nature releases."""
from pathlib import Path
import subprocess, sys, json, socket, signal
ROOT=Path.cwd();OUT=Path('/tmp/bobby-world-batch6-walk-review-r6' if '--review-only' in sys.argv else '/tmp/bobby-world-batch6-walk-review');LOG=Path('/tmp/bobby-world-batch6-walk-window.log')
with socket.socket() as sock:
    if sock.connect_ex(('127.0.0.1',4367))==0:raise SystemExit('Port 4367 already occupied; preserve its owner')
commands=[['/Applications/Blender.app/Contents/MacOS/Blender','-b','-t','2','--python-exit-code','1','-P','tools/world/facility-craft/batch6/walk/build_native.py','--','--surface-dir','/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/public/assets/world/craft-batch6-facilities'],['node','tools/world/check-club-audio.mjs'],['./node_modules/.bin/astro','build','--config','astro.batch6.walk.config.mjs','--outDir',str(OUT)]]
if '--review-only' in sys.argv: commands=commands[1:]
with LOG.open('w') as log:
    for command in commands:
        result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT);print(json.dumps({'stage':command[0],'exit':result.returncode}),flush=True)
        if result.returncode:sys.exit(result.returncode)
    server=subprocess.Popen(['/usr/bin/python3','-m','http.server','4367','--bind','127.0.0.1','--directory',str(OUT)],stdout=log,stderr=subprocess.STDOUT)
    Path('/tmp/bobby-world-batch6-walk-server.json').write_text(json.dumps({'pid':server.pid,'parentPid':__import__('os').getpid(),'port':4367,'directory':str(OUT)}))
    def stop(*_):
        if server.poll() is None:server.terminate()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    print('WALK_SERVER '+str(server.pid),flush=True)
    try:sys.exit(server.wait())
    finally:
        if server.poll() is None:server.terminate();server.wait(timeout=10)
