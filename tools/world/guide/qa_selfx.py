"""Triangle-level self-intersection on the continuous body shell (and rigid parts vs body).
Run on native:  Blender -b blend/G24.blend --python-exit-code 1 -P qa_selfx.py -- native OUT.json
Run on a GLB:   Blender -b --factory-startup --python-exit-code 1 -P qa_selfx.py -- glb GLB OUT.json

Method: evaluate the deformed mesh, triangulate (loop triangles), build mathutils BVHTree with
all_triangles=True and call tree.overlap(tree). In Blender 4.2.23 the overlap callback
(py_bvhtree_overlap_cb, mathutils_bvhtree.cc) runs isect_tri_tri_v3 on every candidate pair,
skips pairs that share >=2 vertex pointers, and for 1 shared vertex keeps the pair only if the
intersection segment is longer than epsilon. Classification is selfx_core.classify (strict
adjacency: shared edge excluded; one shared vertex excluded only if every witness is within 1e-5 m
of it, or the exact rational plane-line test proves the intersection is that vertex alone; no
shared vertex -> any witness is a crossing; no witness -> 'no_witness', counted as a failure).
The legacy 'nonadjacent' count (drop every pair sharing any vertex) is kept for comparison. Limits: float32 coordinates, no exact predicates; coplanar
touching and near-degenerate triangles can be reported or missed; only sampled frames are
tested (no continuous collision between frames). A count of 0 is evidence, not proof.
"""
import bpy, bmesh, hashlib, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import selfx_core
from collections import Counter, defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
mode = argv[0]
if mode == 'glb':
    glb, out = argv[1], argv[2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 60
    bpy.ops.import_scene.gltf(filepath=glb)
    src = dict(glb=glb, sha256=hashlib.sha256(open(glb, 'rb').read()).hexdigest())
else:
    out = argv[1]
    src = dict(blend=bpy.data.filepath)
sc = bpy.context.scene
sc.render.fps = 60
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
body = next(o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
me = body.data
gn = {g.index: g.name for g in body.vertex_groups}
# Weld by rest position with a KD-tree tolerance: the GLB splits vertices at material/normal seams,
# and Draco quantisation makes the split copies differ by a few micrometres, so exact or rounded
# keys can fail to rejoin them (which would mislabel adjacent seam triangles as nonadjacent).
from mathutils.kdtree import KDTree
WELD_TOL = 5e-5
kd = KDTree(len(me.vertices))
for v in me.vertices:
    kd.insert(v.co, v.index)
kd.balance()
weld = list(range(len(me.vertices)))
for v in me.vertices:
    for co, j, d in kd.find_range(v.co, WELD_TOL):
        if j < weld[v.index]:
            weld[v.index] = j
for i in range(len(weld)):                     # path-compress to the smallest index
    while weld[weld[i]] != weld[i]:
        weld[i] = weld[weld[i]]
par = {}
def find(a):
    while par.setdefault(a, a) != a:
        par[a] = par[par[a]]; a = par[a]
    return a
for e in me.edges:
    par[find(weld[e.vertices[0]])] = find(weld[e.vertices[1]])
root = [find(weld[v.index]) for v in me.vertices]
# v3: the body skin is the shell whose vertices carry the most distinct deform bones (the round
# helmet now has more vertices than the skin, so 'largest shell' no longer identifies it)
_gn = {g.index: g.name for g in body.vertex_groups}
_bones = {}
for _v in body.data.vertices:
    _bones.setdefault(root[_v.index], set()).update(_gn[g.group] for g in _v.groups if g.weight > 1e-3)
body_root = max(_bones, key=lambda r: (len(_bones[r]), Counter(root)[r]))
dom = [gn[max(v.groups, key=lambda g: g.weight).group] if v.groups else '?' for v in me.vertices]
assert any(dom[i] == 'pelvis' for i in range(len(dom)) if root[i] == body_root), 'body shell must carry pelvis weight'
matname = lambda p: me.materials[me.polygons[p].material_index].name


def action(clip):
    return next(a for a in bpy.data.actions if a.name == clip or a.name.split('_')[0] == clip)


def pose(clip, frame):
    ad = arm.animation_data or arm.animation_data_create()
    if clip is None:
        ad.action = None
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
        sc.frame_set(0)
    else:
        ad.action = action(clip); sc.frame_set(frame)


def test(label):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    tris = [tuple(t.vertices) for t in m.loop_triangles]
    tpoly = [t.polygon_index for t in m.loop_triangles]
    ev.to_mesh_clear()
    tree = BVHTree.FromPolygons(pts, tris, all_triangles=True)
    wset = [{weld[i] for i in t} for t in tris]
    wpos = {weld[i]: pts[i] for i in range(len(pts))}
    kinds, legacy, same_shell, where, cross_shell = Counter(), 0, Counter(), [], Counter()
    for a, b in tree.overlap(tree):
        if a >= b:
            continue
        sa, sb = root[tris[a][0]], root[tris[b][0]]
        if sa != sb:
            p = a if sa != body_root else b; q = b if p == a else a
            cross_shell[f'{matname(tpoly[p])}|{dom[tris[q][0]]}'] += 1
            continue
        kind, span = selfx_core.classify(pts, tris[a], tris[b], wset[a], wset[b], wpos, weld)
        if not (wset[a] & wset[b]) and sa == body_root:
            legacy += 1
        shell = 'body' if sa == body_root else matname(tpoly[a])
        kinds[f'{shell}:{kind}'] += 1
        if kind in ('crossing', 'no_witness'):
            same_shell[shell] += 1
            c = (sum((pts[i] for i in tris[a]), Vector()) + sum((pts[i] for i in tris[b]), Vector())) / 6
            where.append(dict(shell=shell, kind=kind, witness_span_m=round(span, 5), center=[round(x, 4) for x in c],
                              bones=sorted({dom[tris[a][0]], dom[tris[b][0]]}),
                              tri_a=[[round(x, 5) for x in pts[i]] for i in tris[a]],
                              tri_b=[[round(x, 5) for x in pts[i]] for i in tris[b]]))
    zones = Counter('+'.join(w['bones']) for w in where if w['shell'] == 'body')
    return dict(label=label, body_shell_nonadjacent_tri_pairs=legacy,
                body_shell_strict_crossings=same_shell.get('body', 0),
                other_shell_self_crossings={k: v for k, v in same_shell.items() if k != 'body'},
                classification=dict(kinds), body_zones=dict(zones), crossings=where[:12],
                cross_shell_overlap_pairs=dict(cross_shell))


R = dict(source=src, blender=bpy.app.version_string, method=__doc__.strip(), weld_tolerance_m=WELD_TOL,
         welded_vertices=len(set(weld)), body_shell_vertices=sum(1 for w in set(weld) if find(w) == body_root),
         shells=len({find(w) for w in set(weld)}), samples=[])
pose(None, 0)
R['samples'].append(test('rest'))
for clip in sorted({x.name.split('_')[0] for x in bpy.data.actions}):   # every clip in the asset
    a = action(clip)
    for f2 in range(2 * int(a.frame_range[0]), 2 * int(a.frame_range[1]) + 1):
        f = f2 / 2
        ad = arm.animation_data
        ad.action = action(clip)
        sc.frame_set(int(f), subframe=f - int(f))
        R['samples'].append(test(f'{clip}@{f:g}'))
worst = {}
for s in R['samples']:
    c = s['label'].split('@')[0]
    n = s['body_shell_strict_crossings'] + sum(s['other_shell_self_crossings'].values())
    if n >= worst.get(c, {}).get('n', -1):
        worst[c] = dict(n=n, at=s['label'], legacy_nonadjacent=s['body_shell_nonadjacent_tri_pairs'], zones=s['body_zones'],
                        other_shells=s['other_shell_self_crossings'])
R['worst_body_shell_per_clip'] = worst
R['total_samples'] = len(R['samples'])
R['samples_with_strict_crossings'] = sum(1 for s in R['samples'] if s['body_shell_strict_crossings'] or s['other_shell_self_crossings'])
json.dump(R, open(out, 'w'), indent=1)
print('SELFX', json.dumps({k: (v['n'], v['at'], v['zones'], v['other_shells']) for k, v in worst.items()}), 'samples', R['total_samples'], 'nonzero', R['samples_with_strict_crossings'])
