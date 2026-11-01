"""Copy QA-passed staged nature-v4 GLBs into public/assets/world/camp, only if the staged file's
SHA-256 matches docs/world/quality-v3/nature-v4/manifest.json and every machine check passed.
Rollback: copy baseline_pre_v4/<ID>.glb back. Run: python3 tools/world/camp/nature-v4/promote_v4.py"""
import hashlib, json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
m = json.load(open(os.path.join(REPO, 'docs/world/quality-v3/nature-v4/manifest.json')))['assets']
for aid, a in m.items():
    src = os.path.join(HERE, 'staging', aid + '.glb'); dst = os.path.join(REPO, 'public/assets/world/camp', aid + '.glb')
    h = hashlib.sha256(open(src, 'rb').read()).hexdigest()
    if h != a['sha256'] or not a['machineChecksAllTrue']:
        sys.exit(f'{aid}: refuse (hash match {h == a["sha256"]}, checks {a["failed"]})')
    shutil.copyfile(src, dst); print('promoted', aid, h[:12], a['trianglesGLBReimport'], 'tris', round(a['trianglesGLBReimport'] / a['baselineTriangles'], 3), 'x')
