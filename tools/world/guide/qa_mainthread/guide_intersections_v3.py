"""[G24 v3 copy of tools/world/camp/quality-audit/guide_intersections.py (main-thread owned, unchanged there).
Only two edits: body shell = the component with the most distinct deform bones (the round v3 helmet has
more vertices than the skin), and the clip list is read from the asset instead of a fixed five-clip list.]

Locate actual non-adjacent body-surface intersections in an evaluated native rig.

Read-only: does not repair or save the input. Blender 4.2.23 BVHTree.overlap already
uses isect_tri_tri_v3; independent segment/triangle hits locate the crossing.
Coplanar and nearly degenerate cases remain flagged, not silently called clear.
Run Blender -b INPUT.blend -P this.py -- REPORT.json [GLB_HASH]
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'camp' / 'quality-audit'))   # main-thread math module, read only
from guide_intersection_math import intersection_points, exact_shared_vertex_only

args = sys.argv[sys.argv.index('--') + 1:]
import_glb = args[args.index('--glb') + 1] if '--glb' in args else None
if import_glb:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 60
    bpy.ops.import_scene.gltf(filepath=import_glb)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in scene.objects if o.type == 'MESH' and o.find_armature() == arm)
raw_vertices = len(mesh.data.vertices)
if import_glb:
    # Imported material/normal seams and per-primitive Draco quantization split
    # the same source coordinates. Disposable 10 um
    # merge restores adjacency for this diagnostic; never exported or saved.
    mesh.data = mesh.data.copy()
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bm.to_mesh(mesh.data); bm.free()
adj = [set() for _ in mesh.data.vertices]
for edge in mesh.data.edges:
    a, b = edge.vertices
    adj[a].add(b)
    adj[b].add(a)
components, visited = [], set()
for i in range(len(adj)):
    if i in visited:
        continue
    stack, comp = [i], set()
    visited.add(i)
    while stack:
        a = stack.pop()
        comp.add(a)
        for b in adj[a] - visited:
            visited.add(b)
            stack.append(b)
    components.append(comp)
_bset = lambda comp: {mesh.vertex_groups[g.group].name for i in comp for g in mesh.data.vertices[i].groups if g.weight > 0.01}
body = max(components, key=lambda c: (len(_bset(c)), len(c)))
component_id = {v: i for i, comp in enumerate(components) for v in comp}
all_shells = '--all-shells' in args
strict_adjacency = '--strict-adjacency' in args
body_weights = {mesh.vertex_groups[g.group].name for i in body for g in mesh.data.vertices[i].groups if g.weight > 0.01}
if 'pelvis' not in body_weights:
    raise RuntimeError('Largest component is not the body skin. Seam reconstruction is incomplete; no clear result may be reported.')
EPS = 1e-6
actions = {a.name.split('_')[0]: a for a in bpy.data.actions}
if arm.animation_data:
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)


def points_and_triangles():
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    tris = [tuple(t.vertices) for t in me.loop_triangles if all_shells or t.vertices[0] in body]
    ev.to_mesh_clear()
    return pts, tris






def inspect():
    pts, tris = points_and_triangles()
    tree = BVHTree.FromPolygons(pts, tris, all_triangles=True, epsilon=0.0)
    cases = []
    inspect.resolved_vertex_contacts = []
    for i, j in tree.overlap(tree):
        a, b = tris[i], tris[j]
        shared = set(a) & set(b)
        if i >= j or len(shared) >= 2 or (shared and not strict_adjacency):
            continue
        if component_id[a[0]] != component_id[b[0]]:
            continue  # cross-shell attachment relations are a separate audit
        aa, bb = [pts[k] for k in a], [pts[k] for k in b]
        hits, extent = intersection_points(aa, bb)
        if shared and hits and all(any((hit-pts[v]).length <= 10*EPS for v in shared) for hit in hits):
            continue  # a shared vertex is legal; a crossing beyond it is not
        if len(shared) == 1 and not hits and exact_shared_vertex_only(aa, bb, pts[next(iter(shared))]) is True:
            inspect.resolved_vertex_contacts.append(dict(triangles=[i, j], coordinates=[[list(x) for x in aa], [list(x) for x in bb]],
                                                        classification='exact_shared_vertex_only'))
            continue
        cases.append(dict(component=component_id[a[0]], triangles=[i, j], vertices=[list(a), list(b)],
                          coordinates=[[list(x) for x in aa], [list(x) for x in bb]],
                          crossing_points=[list(x) for x in hits], segment_length_m=extent,
                          classification='noncoplanar_segment' if extent > 10 * EPS else 'contact_or_coplanar_unresolved'))
    return cases


report = dict(
    source=import_glb or bpy.data.filepath,
    source_sha256=hashlib.sha256(Path(import_glb or bpy.data.filepath).read_bytes()).hexdigest(),
    associated_glb_sha256=args[1] if len(args) > 1 else None,
    blender=bpy.app.version_string,
    method='triangulated evaluated largest connected body shell; BVHTree triangle intersection followed by clipped edge/ray-triangle witnesses',
    source_reference='https://raw.githubusercontent.com/blender/blender/v4.2.23/source/blender/python/mathutils/mathutils_bvhtree.cc#L485-L513',
    scope=('reimported GLB' if import_glb else 'native') + (' all closed shells individually' if all_shells else ' body shell') + '; cross-shell attachment relations excluded; integer and half keyframes at 60 fps',
    limits='BVH and ray witnesses use floating point; exact rational predicate only resolves no-witness single-shared-vertex contacts; shared-edge pairs excluded; coplanar cases not exhaustive; remaining hits stay unresolved errors',
    shared_vertex_policy='exclude only contact at the shared vertex' if strict_adjacency else 'exclude all pairs sharing a vertex (legacy diagnostic)',
    unresolved_shared_vertex_policy='no float ray witness: exact rational plane-line cone classification; coplanar/degenerate stays unresolved; resolved examples retained',
    epsilon_m=EPS, imported_seam_merge_m=1e-5 if import_glb else None,
    raw_vertices=raw_vertices, adjacency_vertices=len(mesh.data.vertices),
    body_vertices=len(body), component_sizes=sorted(map(len, components), reverse=True), clips={})
arm.data.pose_position = 'REST'
scene.frame_set(0)
report['rest'] = inspect()
report['rest_resolved_vertex_contacts'] = inspect.resolved_vertex_contacts
arm.data.pose_position = 'POSE'
for clip in sorted(actions):
    action = actions[clip]
    arm.animation_data.action = action
    start, end = action.frame_range
    count = int(round((end - start) * 2)) + 1
    rows, worst, longest, resolved_examples = [], None, 0., []
    for step in range(count):
        frame = start + step / 2
        scene.frame_set(math.floor(frame), subframe=frame % 1)
        cases = inspect()
        max_segment = max((x['segment_length_m'] for x in cases), default=0.)
        rows.append(dict(time_s=step / 120, raw_pairs=len(cases),
                         exact_shared_vertex_contacts=len(inspect.resolved_vertex_contacts),
                         segment_confirmed=sum(x['classification'] == 'noncoplanar_segment' for x in cases),
                         max_segment_m=max_segment))
        if len(resolved_examples) < 6 and inspect.resolved_vertex_contacts:
            resolved_examples.append(dict(time_s=step/120, cases=inspect.resolved_vertex_contacts))
        if worst is None or max_segment > longest or (max_segment == longest and len(cases) > len(worst['cases'])):
            longest = max_segment
            worst = dict(time_s=step / 120, cases=cases)
    report['clips'][clip] = dict(samples=count, rows=rows, worst=worst, resolved_vertex_contact_examples=resolved_examples)
target = Path(args[0]); target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(rest_pairs=len(report['rest']), clips={k: dict(samples=v['samples'],
    raw_max=max(x['raw_pairs'] for x in v['rows']),
    confirmed_max=max(x['segment_confirmed'] for x in v['rows']),
    max_segment_m=max(x['max_segment_m'] for x in v['rows']), worst_time=v['worst']['time_s'])
    for k, v in report['clips'].items()}), indent=2))
