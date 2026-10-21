"""A6 relation table check for G24 (cross-shell intersections + embedded burial/exposure).
Run on native:  Blender -b blend/G24.blend --python-exit-code 1 -P qa_relations.py -- native OUT.json
Run on a GLB:   Blender -b --factory-startup --python-exit-code 1 -P qa_relations.py -- glb GLB OUT.json

Shells are welded connected components (KD weld 5e-5 m, as qa_selfx). Parts are identified from the
asset itself: largest shell = body skin; other shells by their one-hot bone + material (helmet/visor/
dot on head, boots on foot.X, mittens on hand.X, bag + flap on pelvis (flap = higher centroid), zip
on chest). A body triangle's region is the bone with the largest skin weight AT THE CROSSING
(rest weights interpolated barycentrically at the mean witness point), so a large chest triangle
whose far corner is shoulder-weighted is still labelled by what drives the skin where it is hit.
Without a witness point the triangle centroid is used.

1. Every cross-shell triangle pair reported by BVHTree.overlap (Blender 4.2.23 runs isect_tri_tri_v3
   in the callback) is classified against RELATIONS: 'embedded-expected' if (part, part|region) is a
   declared embedded pair, otherwise 'unintended'. Pairs with no segment witness (coplanar) are
   counted separately as no_witness. Unintended must be 0 in every sample.
2. For each embedded pair, guest surface points (vertices plus a barycentric grid of 15 points per
   triangle near the host, because a flat box face can interpenetrate a coarse skin with no vertex
   inside) get a signed distance to the closed host shell (closest
   face, normal sign; negative = inside), and host vertices (the host region for body hosts) get the
   same (vertices + grid) against the closed guest shell. burial = max(deepest guest point inside host, deepest host
   point inside guest) = interpenetration depth (a flat bag face pressed on a convex jacket has the
   jacket bulging into the bag, not bag corners inside the jacket). exposed = farthest guest point
   outside the host. Both must stay >= the declared minimum in every sample.
Samples: rest + every integer and half frame of every clip. Limits: float32, sampled frames only,
closest-face sign can misjudge points near sharp concave host edges.
"""
import bpy, hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import selfx_core
from collections import Counter, defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

TORSO = ('pelvis', 'spine', 'chest')
# Declared before measurement (design intent from build_guide.py geometry), metres.
RELATIONS = [
    dict(id='helmet/collar', guest='body', guest_regions=('neck',), host='helmet', host_regions=None,
         min_burial_m=0.010, min_exposed_m=0.010, note='collar top tucked inside the helmet opening'),
    dict(id='boot.R/trouser', guest='body', guest_regions=('shin.R',), host='boot.R', host_regions=None,
         min_burial_m=0.010, min_exposed_m=0.050, note='trouser end inside the boot shaft'),
    dict(id='boot.L/trouser', guest='body', guest_regions=('shin.L',), host='boot.L', host_regions=None,
         min_burial_m=0.010, min_exposed_m=0.050, note='trouser end inside the boot shaft'),
    dict(id='mitten.R/sleeve', guest='mitten.R', guest_regions=None, host='body', host_regions=('forearm.R', 'hand.R'),
         min_burial_m=0.010, min_exposed_m=0.050, note='glove root inside the cuff'),
    dict(id='mitten.L/sleeve', guest='mitten.L', guest_regions=None, host='body', host_regions=('forearm.L', 'hand.L'),
         min_burial_m=0.010, min_exposed_m=0.050, note='glove root inside the cuff'),
    dict(id='bag/jacket', guest='bag', guest_regions=None, host='body', host_regions=('pelvis', 'spine'),
         min_burial_m=0.003, min_exposed_m=0.030, note='bag back pressed into the jacket at the belt line'),
    dict(id='bagflap/jacket', guest='bagflap', guest_regions=None, host='body', host_regions=('pelvis', 'spine'),
         min_burial_m=0.002, min_exposed_m=0.030, note='flap back pressed into the jacket'),
    dict(id='bagflap/bag', guest='bagflap', guest_regions=None, host='bag', host_regions=None,
         min_burial_m=0.002, min_exposed_m=0.003, note='flap overlaps the bag top'),
    dict(id='zip/chest', guest='zip', guest_regions=None, host='body', host_regions=TORSO,
         min_burial_m=0.002, min_exposed_m=0.003, note='zip strip set into the jacket front'),
    dict(id='visor/helmet', guest='visor', guest_regions=None, host='helmet', host_regions=None,
         min_burial_m=0.005, min_exposed_m=0.005, note='visor plate set into the helmet shell'),
    dict(id='dot/helmet', guest='dot', guest_regions=None, host='helmet', host_regions=None,
         min_burial_m=0.005, min_exposed_m=0.010, note='cyan dot set into the helmet, right side'),
]
UNINTENDED_NAMED = {  # labels for the Fable list; every pair outside RELATIONS is unintended anyway
    'hand_vs_bag': lambda a, b: {a, b} & {'mitten.R', 'mitten.L'} and {a, b} & {'bag', 'bagflap'},
    'hand_vs_torso': lambda a, b: {a, b} & {'mitten.R', 'mitten.L'} and {a, b} & {f'body|{r}' for r in TORSO},
    'boot_vs_not_own_trouser': lambda a, b: any(x.startswith('boot') for x in (a, b)),
    'helmet_vs_shoulder': lambda a, b: 'helmet' in (a, b) and {a, b} & {'body|chest', 'body|upperarm.R', 'body|upperarm.L'},
    'arm_vs_bag': lambda a, b: {a, b} & {'bag', 'bagflap'} and any(x.startswith(('body|upperarm', 'body|forearm', 'body|hand')) for x in (a, b)),
    'leg_vs_bag': lambda a, b: {a, b} & {'bag', 'bagflap'} and any(x.startswith(('body|thigh', 'body|shin')) for x in (a, b)),
}

argv = sys.argv[sys.argv.index('--') + 1:]
mode = argv[0]
if mode == 'glb':
    glb, out = argv[1], argv[2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 60          # before import, so the clip frame ranges match native
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
WELD_TOL = 5e-5
kd = KDTree(len(me.vertices))
for v in me.vertices:
    kd.insert(v.co, v.index)
kd.balance()
weld = list(range(len(me.vertices)))
for v in me.vertices:
    for co, j, d in kd.find_range(v.co, WELD_TOL):
        weld[v.index] = min(weld[v.index], j)
for i in range(len(weld)):
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
body_root = Counter(root).most_common(1)[0][0]
dom = [gn[max(v.groups, key=lambda g: g.weight).group] if v.groups else '?' for v in me.vertices]
wts = [{gn[g.group]: g.weight for g in v.groups} for v in me.vertices]
matof = lambda p: me.materials[me.polygons[p].material_index].name

# ---- identify parts per shell
shell_verts = defaultdict(list)
for i, r in enumerate(root):
    shell_verts[r].append(i)
shell_mats = defaultdict(Counter)
for p in me.polygons:
    shell_mats[root[p.vertices[0]]][matof(p.index)] += 1
part_of_shell, pelvis_shells = {}, []
for r, ids in shell_verts.items():
    if r == body_root:
        part_of_shell[r] = 'body'; continue
    bones = Counter(dom[i] for i in ids)
    bone = bones.most_common(1)[0][0]
    assert len(bones) == 1, ('rigid part must be one-hot', bones)
    mat = shell_mats[r].most_common(1)[0][0]
    if bone.startswith('hand.'):
        part_of_shell[r] = 'mitten.' + bone[-1]
    elif bone.startswith('foot.'):
        part_of_shell[r] = 'boot.' + bone[-1]
    elif bone == 'head':
        part_of_shell[r] = 'helmet' if 'helmet' in mat else 'visor' if 'visor' in mat else 'dot' if 'dot' in mat else f'head?{mat}'
    elif bone == 'pelvis':
        pelvis_shells.append(r)
    elif bone == 'chest':
        part_of_shell[r] = 'zip'
    else:
        part_of_shell[r] = f'?{bone}'
pelvis_shells.sort(key=lambda r: sum(me.vertices[i].co.z for i in shell_verts[r]) / len(shell_verts[r]))
for r, n in zip(pelvis_shells, ('bag', 'bagflap')):
    part_of_shell[r] = n
parts = sorted(part_of_shell.values())
assert parts == sorted(['body', 'helmet', 'visor', 'dot', 'boot.R', 'boot.L', 'mitten.R', 'mitten.L', 'bag', 'bagflap', 'zip']), parts
shell_of_part = {v: k for k, v in part_of_shell.items()}


def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return (1 / 3, 1 / 3, 1 / 3)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    bc = [max(0.0, 1 - v - w), max(0.0, v), max(0.0, w)]
    t = sum(bc) or 1.0
    return [x / t for x in bc]


def tri_label(tri, pts, at=None):
    p = part_of_shell[root[tri[0]]]
    if p != 'body':
        return p
    P = at if at is not None else sum((pts[i] for i in tri), Vector()) / 3
    acc = Counter()
    for i, k in zip(tri, bary(P, *(pts[i] for i in tri))):
        for n, w in wts[i].items():
            acc[n] += k * w
    return 'body|' + acc.most_common(1)[0][0]


ALLOWED = {}
for R_ in RELATIONS:
    gl = [R_['guest']] if R_['guest_regions'] is None else [f"body|{r}" for r in R_['guest_regions']]
    hl = [R_['host']] if R_['host_regions'] is None else [f"body|{r}" for r in R_['host_regions']]
    for g in gl:
        for h in hl:
            ALLOWED[frozenset((g, h))] = R_['id']


def action(clip):
    return next(a for a in bpy.data.actions if a.name == clip or a.name.split('_')[0] == clip)


def test(label):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    tris = [tuple(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    tree = BVHTree.FromPolygons(pts, tris, all_triangles=True)
    emb, unint, nowit, named = Counter(), Counter(), Counter(), Counter()
    examples = []
    for a, b in tree.overlap(tree):
        if a >= b or root[tris[a][0]] == root[tris[b][0]]:
            continue
        A = [pts[i] for i in tris[a]]; B = [pts[i] for i in tris[b]]
        W = selfx_core.witnesses(A, B)
        at = sum(W, Vector()) / len(W) if W else None
        la, lb = tri_label(tris[a], pts, at), tri_label(tris[b], pts, at)
        key = '|'.join(sorted((la, lb)))
        if not W:
            nowit[key] += 1
        rid = ALLOWED.get(frozenset((la, lb)))
        if rid:
            emb[rid] += 1
        else:
            unint[key] += 1
            for n, f in UNINTENDED_NAMED.items():
                if f(la, lb):
                    named[n] += 1
            if len(examples) < 6:
                c = (sum(A, Vector()) + sum(B, Vector())) / 6
                examples.append(dict(pair=key, center=[round(x, 4) for x in c], witnesses=len(W)))
    # burial / exposure
    trees = {}
    def host_tree(part):
        if part not in trees:
            s = shell_of_part[part]
            ft = [t for t in tris if root[t[0]] == s]
            trees[part] = BVHTree.FromPolygons(pts, ft, all_triangles=True)
        return trees[part]
    def sdist_pts(tree, P):
        r = []
        for q in P:
            loc, nrm, fi, dist = tree.find_nearest(q)
            r.append(dist if (q - loc).dot(nrm) > 0 else -dist)
        return r
    sdist = lambda tree, ids: sdist_pts(tree, [pts[i] for i in ids])
    GRID = [(a / 4, b / 4, (4 - a - b) / 4) for a in range(5) for b in range(5 - a)]

    def surface(ids, near):
        # grid points of triangles whose 3 vertices are in ids and that lie within 1 cm of the near box
        S = set(ids)
        lo = Vector([min(pts[i][k] for i in near) - 0.01 for k in range(3)])
        hi = Vector([max(pts[i][k] for i in near) + 0.01 for k in range(3)])
        P = []
        for t in tris:
            if t[0] in S and t[1] in S and t[2] in S:
                c = [pts[i] for i in t]
                if all(min(v[k] for v in c) <= hi[k] and max(v[k] for v in c) >= lo[k] for k in range(3)):
                    P += [c[0] * g0 + c[1] * g1 + c[2] * g2 for g0, g1, g2 in GRID]
        return P
    rel = {}
    for R_ in RELATIONS:
        gs, hs = shell_of_part[R_['guest']], shell_of_part[R_['host']]
        ids = [i for i in range(len(pts)) if root[i] == gs and (R_['guest_regions'] is None or dom[i] in R_['guest_regions'])]
        hid = [i for i in range(len(pts)) if root[i] == hs and (R_['host_regions'] is None or dom[i] in R_['host_regions'])]
        sd = sdist(host_tree(R_['host']), ids)
        rd = sdist(host_tree(R_['guest']), hid)
        sg = sdist_pts(host_tree(R_['host']), surface(ids, hid)) or [1.0]
        sh = sdist_pts(host_tree(R_['guest']), surface(hid, ids)) or [1.0]
        g_in, h_in = max(0.0, -min(sd), -min(sg)), max(0.0, -min(rd), -min(sh))
        rel[R_['id']] = dict(guest_vertices=len(ids), guest_inside_host=sum(1 for d in sd if d < 0),
                             host_vertices=len(hid), host_inside_guest=sum(1 for d in rd if d < 0),
                             guest_depth_in_host_m=round(g_in, 5), host_depth_in_guest_m=round(h_in, 5),
                             burial_m=round(max(g_in, h_in), 5), exposed_m=round(max(0.0, max(sd)), 5))
    return dict(label=label, embedded_expected=dict(emb), unintended=dict(unint), unintended_named=dict(named),
                no_witness=dict(nowit), unintended_examples=examples, relations=rel)


Rep = dict(source=src, blender=bpy.app.version_string, method=__doc__.strip(), weld_tolerance_m=WELD_TOL,
           parts={p: len(shell_verts[shell_of_part[p]]) for p in parts},
           relations_declared=RELATIONS and [{k: v for k, v in r.items()} for r in RELATIONS],
           unintended_named_classes=sorted(UNINTENDED_NAMED), samples=[])
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
sc.frame_set(0)
Rep['samples'].append(test('rest'))
for clip in ('Idle', 'Walk', 'Run', 'Jump', 'Land'):
    a = action(clip)
    ad.action = a
    for f2 in range(2 * int(a.frame_range[0]), 2 * int(a.frame_range[1]) + 1):
        f = f2 / 2
        sc.frame_set(int(f), subframe=f - int(f))
        Rep['samples'].append(test(f'{clip}@{f:g}'))
summary = {}
for R_ in RELATIONS:
    rid = R_['id']
    b = min(Rep['samples'], key=lambda s: s['relations'][rid]['burial_m'])
    x = min(Rep['samples'], key=lambda s: s['relations'][rid]['exposed_m'])
    mb, mx = b['relations'][rid]['burial_m'], x['relations'][rid]['exposed_m']
    summary[rid] = dict(min_burial_m=mb, at=b['label'], min_exposed_m=mx, exposed_at=x['label'],
                        declared_min_burial_m=R_['min_burial_m'], declared_min_exposed_m=R_['min_exposed_m'],
                        max_crossing_pairs=max(s['embedded_expected'].get(rid, 0) for s in Rep['samples']),
                        passed=mb >= R_['min_burial_m'] and mx >= R_['min_exposed_m'])
tot_un = Counter()
for s in Rep['samples']:
    for k, v in s['unintended'].items():
        tot_un[k] = max(tot_un[k], v)
Rep['relation_summary'] = summary
Rep['unintended_max_per_pair'] = dict(tot_un)
Rep['samples_with_unintended'] = [s['label'] for s in Rep['samples'] if s['unintended']]
Rep['samples_with_no_witness'] = [s['label'] for s in Rep['samples'] if s['no_witness']]
Rep['total_samples'] = len(Rep['samples'])
Rep['passed'] = not Rep['samples_with_unintended'] and all(v['passed'] for v in summary.values())
json.dump(Rep, open(out, 'w'), indent=1)
print('REL', json.dumps(dict(passed=Rep['passed'], samples=Rep['total_samples'], unintended=Rep['unintended_max_per_pair'],
                             n_unintended_samples=len(Rep['samples_with_unintended']),
                             no_witness=len(Rep['samples_with_no_witness']),
                             summary={k: (v['min_burial_m'], v['min_exposed_m'], v['passed'], v['at'], v['exposed_at']) for k, v in summary.items()})))
