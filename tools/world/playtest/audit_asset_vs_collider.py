"""Offline audit (no server): sample deployed camp GLB geometry against the runtime's
collider rules as written in src/components/world (commit c507506).
Run: Blender -b --factory-startup -P audit_asset_vs_collider.py -- <repo> <out.json>
GLB is imported (Draco decoded by Blender's bundled library); Blender Z-up world here,
so glTF (x, y, z) == Blender (x, -z... ) is handled by the importer: we read Blender coords
and convert back to glTF/world axes as (x, z_b, -y_b).
"""
import bpy, sys, os, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ARGS = sys.argv[sys.argv.index('--') + 1:]
REPO, OUT = ARGS[0], ARGS[1]
CAMP = os.path.join(REPO, 'public/assets/world/camp')

def load(aid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CAMP, aid + '.glb'))
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        base = len(verts)
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            verts.append(Vector((p.x, p.z, -p.y)))  # -> glTF/world axes (+Y up)
        for f in me.polygons:
            polys.append([base + i for i in f.vertices])
        ev.to_mesh_clear()
    return verts, polys

def place(verts, pos, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    # three.js rotation.y = yaw: x' = x c + z s ; z' = -x s + z c
    return [Vector((pos[0] + v.x * c + v.z * s, pos[1] + v.y, pos[2] - v.x * s + v.z * c)) for v in verts]

def height_at(bvh, x, z, top=50.0):
    hit = bvh.ray_cast(Vector((x, top, z)), Vector((0, -1, 0)))
    return None if hit[0] is None else hit[0].y

report = {'source': 'c507506 WorldEnvironment.createLayout + WorldCamp placements', 'items': {}}

# ---- tents: collider cuboid centre (x, 6.25, 12.5) size 5.5 x 2.9 x 4.2 (axis aligned), visual yaw -pi/2 at base y 4.8
for idx, (x, aid) in enumerate([(-51, 'C04'), (-42, 'C03'), (-33, 'C04')]):
    v, p = load(aid)
    w = place(v, (x, 4.8, 12.5), -math.pi / 2)
    bvh = BVHTree.FromPolygons([tuple(q) for q in w], p)
    xs = [q.x for q in w]; zs = [q.z for q in w]; ys = [q.y for q in w]
    box = dict(x=[x - 2.75, x + 2.75], y=[4.8, 7.7], z=[12.5 - 2.1, 12.5 + 2.1])
    grid, air, over = [], 0, 0
    n = 0
    for i in range(23):
        for k in range(18):
            gx = box['x'][0] + (i + 0.5) * 5.5 / 23; gz = box['z'][0] + (k + 0.5) * 4.2 / 18
            h = height_at(bvh, gx, gz)
            vh = 0.0 if h is None else h - 4.8
            n += 1
            if vh < 2.9 - 0.25: air += 1
            grid.append(round(vh, 3))
    # horizontal clearance at the box faces: distance from box face inward to first canvas hit, per height
    faces = {}
    for name, origin_fn, d in (('south(+Z,entrance)', lambda t, y: Vector((x - 2.6 + t * 5.2, y, 14.6)), Vector((0, 0, -1))),
                               ('east(+X)', lambda t, y: Vector((x + 2.75, y, 10.6 + t * 3.8)), Vector((-1, 0, 0))),
                               ('north(-Z)', lambda t, y: Vector((x - 2.6 + t * 5.2, y, 10.4)), Vector((0, 0, 1)))):
        rows = {}
        for hgt in (0.3, 1.0, 1.6):
            gaps = []
            for j in range(11):
                o = origin_fn(j / 10, 4.8 + hgt)
                hit = bvh.ray_cast(o, d, 6.0)
                gaps.append(None if hit[0] is None else round(hit[3], 3))
            rows[f'h{hgt}'] = gaps
        faces[name] = rows
    report['items'][f'tent{idx}_{aid}'] = {
        'visualBoundsWorld': {'x': [round(min(xs), 3), round(max(xs), 3)], 'y': [round(min(ys), 3), round(max(ys), 3)], 'z': [round(min(zs), 3), round(max(zs), 3)]},
        'colliderBox': box,
        'fractionOfColliderFootprintWhereCanvasIsMoreThan0.25mBelowBoxTop': round(air / n, 3),
        'gapFromColliderFaceToCanvas_m(None=no canvas within 6m)': faces,
    }

# ---- pad props: collider axis-aligned 1.05 x 0.9 x 0.9 centred (x, 5.35, z); visual on pad top 4.9, yaw = pi - angle
for aid, ring in (('C07', 3), ('C09', 5), ('C10', 4)):
    a = ring * math.pi / 4
    x, z = -42 + math.cos(a) * 15, 30 + math.sin(a) * 15
    yaw = 2.6 if aid == 'C10' else math.pi - a
    v, p = load(aid)
    w = place(v, (x, 4.9, z), yaw)
    xs = [q.x for q in w]; zs = [q.z for q in w]; ys = [q.y for q in w]
    box = dict(x=[x - 0.525, x + 0.525], y=[4.9, 5.8], z=[z - 0.45, z + 0.45])
    outside = sum(1 for q in w if not (box['x'][0] <= q.x <= box['x'][1] and box['z'][0] <= q.z <= box['z'][1]) and q.y < 4.9 + 1.8)
    report['items'][aid] = {'visualAABBWorld': {'x': [round(min(xs), 3), round(max(xs), 3)], 'y': [round(min(ys), 3), round(max(ys), 3)], 'z': [round(min(zs), 3), round(max(zs), 3)]},
                            'colliderBox': box, 'verticesBelowHeadHeightOutsideColliderXZ': outside, 'totalVertices': len(w)}

# ---- trees: crown underside height (first canvas from below) and trunk width at 1 m
for aid in ('G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23'):
    v, p = load(aid)
    bvh = BVHTree.FromPolygons([tuple(q) for q in v], p)
    xs = [q.x for q in v]; zs = [q.z for q in v]; ys = [q.y for q in v]
    lows = []
    for i in range(15):
        for k in range(15):
            gx = min(xs) + (i + 0.5) * (max(xs) - min(xs)) / 15; gz = min(zs) + (k + 0.5) * (max(zs) - min(zs)) / 15
            if math.hypot(gx, gz) < 0.45:
                continue
            hit = bvh.ray_cast(Vector((gx, -0.01, gz)), Vector((0, 1, 0)), 20)
            if hit[0] is not None:
                lows.append(hit[0].y)
    report['items'][aid] = {'sizeGLB': [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)],
                            'lowestOverhangOutside0.45mOfAxis_m': round(min(lows), 3) if lows else None,
                            'runtimeCollider': 'trunk box 0.7x2.8x0.7' if aid in ('G16', 'G17', 'G18') else 'NONE (createNature: visual-only)'}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(report, open(OUT, 'w'), indent=1)
print('[audit] wrote', OUT)
