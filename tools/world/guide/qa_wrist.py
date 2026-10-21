"""Wrist connection check on a FRESH import of the final GLB (mitten = rigid glove part on hand.X,
sleeve = continuous body skin). Run:
  Blender -b --factory-startup --python-exit-code 1 -P qa_wrist.py -- GLB OUT.json
For every mitten vertex: signed distance to the body shell (negative = inside the sleeve, via the
closest-face normal) and, per wrist, the overlap depth along the forearm axis. Sampled at rest and
at every frame of every clip.
"""
import bpy, hashlib, json, math, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 60
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
mesh = next(o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
me = mesh.data
jn = {g.index: g.name for g in mesh.vertex_groups}
# connected components on the imported mesh (welded by position: glTF splits at material seams)
key = lambda co: (round(co.x, 5), round(co.y, 5), round(co.z, 5))
parent = {}
def find(a):
    while parent.setdefault(a, a) != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for e in me.edges:
    a, b = key(me.vertices[e.vertices[0]].co), key(me.vertices[e.vertices[1]].co)
    parent[find(a)] = find(b)
root_of = [find(key(v.co)) for v in me.vertices]
from collections import Counter
body_root = Counter(root_of).most_common(1)[0][0]
dom = lambda v: jn[max(v.groups, key=lambda g: g.weight).group]
mitten = {tag: [v.index for v in me.vertices if root_of[v.index] != body_root and dom(v) == f'hand.{tag}'] for tag in ('R', 'L')}
body_faces = [p.index for p in me.polygons if root_of[p.vertices[0]] == body_root]


def sample(label):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg); m = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    tree = BVHTree.FromPolygons(pts, [tuple(me.polygons[i].vertices) for i in body_faces])
    res = {}
    for tag, ids in mitten.items():
        sd = []
        for i in ids:
            loc, nrm, fi, dist = tree.find_nearest(pts[i])
            sd.append(dist if (pts[i] - loc).dot(nrm) > 0 else -dist)
        inside = [d for d in sd if d < 0]
        # overlap length along the hand bone: span of mitten vertices that are inside the sleeve
        pb = arm.pose.bones[f'hand.{tag}']
        h, t = arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail
        ax = (t - h).normalized()
        proj_in = [(pts[i] - h).dot(ax) for i, d in zip(ids, sd) if d < 0]
        res[tag] = dict(mitten_vertices=len(ids), inside_sleeve=len(inside),
                        deepest_inside_m=-min(sd), outside_max_m=max(sd),
                        overlap_span_along_hand_m=(max(proj_in) - min(proj_in)) if proj_in else 0.0)
    return res


R = dict(glb=glb, sha256=hashlib.sha256(open(glb, 'rb').read()).hexdigest(), samples={})
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
sc.frame_set(0)
R['samples']['rest'] = sample('rest')
worst = dict(min_inside=10**9, min_overlap=1e9)
for a in bpy.data.actions:
    ad.action = a
    for f in range(int(a.frame_range[0]), int(a.frame_range[1]) + 1):
        sc.frame_set(f)
        s = sample(f'{a.name}@{f}')
        for tag, r in s.items():
            if r['inside_sleeve'] < worst['min_inside']:
                worst['min_inside'] = r['inside_sleeve']; worst['min_inside_at'] = f'{a.name}@{f}.{tag}'
            if r['overlap_span_along_hand_m'] < worst['min_overlap']:
                worst['min_overlap'] = r['overlap_span_along_hand_m']; worst['min_overlap_at'] = f'{a.name}@{f}.{tag}'
R['worst_over_all_clip_frames'] = worst
R['method'] = ('Mitten vertices classified against the evaluated body shell by closest-face normal sign. '
               'A mitten with zero vertices inside the sleeve would be floating; >0 with a nonzero overlap span '
               'means the glove root is buried in the cuff. Hand bones carry identity rotation relative to the '
               'forearm in every clip, so the wrist does not bend.')
json.dump(R, open(out, 'w'), indent=1)
print('WRIST', json.dumps(R['samples']['rest']), json.dumps(worst))
