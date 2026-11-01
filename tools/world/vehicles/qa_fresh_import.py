"""Read-only fresh-scene QA of final GLBs, source BLENDs, role extras and runtime hull data."""
import bpy, bmesh, os, sys, json, hashlib
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/vehicles'))
import vehlib as V

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'docs/world/vehicles/fresh-import.json'
with open(V.HULL_JSON) as f:
    hulls = json.load(f)
results = []
for asset in ('G25', 'G26', 'G27'):
    glb = os.path.join(V.GLB_DIR, asset + '.glb')
    door_report = os.path.join(V.DOC_DIR, 'door-' + asset + '-report.json')
    with open(door_report if os.path.exists(door_report) else os.path.join(V.DOC_DIR, asset + '-report.json')) as f:
        expected = json.load(f)
    V.reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    root = bpy.data.objects[asset]
    checks = {o.name: V.mesh_checks(o) for o in meshes}
    bounds = list(V.world_bounds(meshes))
    tris = {o.name: V.evaluated_tris(o) for o in meshes}
    materials = {m.name: m.get('materialRole') for o in meshes for m in o.data.materials if m}
    entry = hulls[asset]
    errors = []
    if bounds != expected.get('sourceBounds', expected.get('bounds')): errors.append('bounds differ from source')
    if sum(tris.values()) != expected['totalTris']: errors.append('triangles differ from source')
    # glTF splits vertices at material and normal seams; raw imported boundary edges are expected.
    # Inspect a welded copy only. Never repair the delivered GLB to make the QA pass.
    welded = {}
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0002)
        welded[o.name] = dict(nonManifoldEdges=sum(not e.is_manifold for e in bm.edges), tolerance_m=0.0002)
        bm.free()
    if any(c['degenerate'] or not c['finite'] or c['signedVolume'] <= 0 for c in checks.values()): errors.append('mesh geometry check failed')
    if any(v is None for v in materials.values()): errors.append('material role missing')
    if json.loads(root['collisionHulls']) != entry['hulls']: errors.append('runtime hulls differ from GLB extras')
    for key in ('bodyY', 'clip', 'wheelRadius', 'wheelWidth'):
        if abs(root[key] - entry[key]) > 1e-6: errors.append(key + ' differs from runtime JSON')
    for h in entry['hulls']:
        if len(h['points']) < 12: errors.append('empty hull ' + h['part'])
    with open(glb, 'rb') as f: digest = hashlib.sha256(f.read()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=os.path.join(V.BLEND_DIR, asset + '.blend'))
    native = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    native_bounds = list(V.world_bounds(native))
    native_tris = sum(V.evaluated_tris(o) for o in native)
    native_checks = {o.name: V.mesh_checks(o) for o in native}
    if any(c['nonManifoldEdges'] for c in native_checks.values()): errors.append('native mesh is non-manifold')
    if native_bounds != bounds or native_tris != sum(tris.values()): errors.append('native BLEND differs from final GLB')
    r = dict(asset=asset, sha256=digest, bytes=os.path.getsize(glb), bounds=bounds, triangles=tris, totalTris=sum(tris.values()), checks=checks, weldedTopologyDiagnostic=welded, materials=materials, hullCount=len(entry['hulls']), nativeBounds=native_bounds, nativeTris=native_tris, nativeChecks=native_checks, errors=errors, passed=not errors)
    results.append(r)
    print('[fresh-import]', asset, r['totalTris'], 'PASS' if r['passed'] else errors)
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w') as f: json.dump(dict(blender=bpy.app.version_string, assets=results, passed=all(r['passed'] for r in results)), f, indent=2)
if not all(r['passed'] for r in results): raise RuntimeError('Vehicle fresh-import QA failed')
