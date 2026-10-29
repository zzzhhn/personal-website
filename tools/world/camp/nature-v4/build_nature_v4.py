"""Camp nature v4 (quality-v3 spec 11.2): G16-G23 at about twice the pre-v4 GLB triangles.

Run:  Blender -b --factory-startup -P tools/world/camp/nature-v4/build_nature_v4.py [-- G16 G21 ...]
Forked from tools/world/camp/nature/build_nature.py (v2). Pre-v4 GLBs are kept in
baseline_pre_v4/ with their SHA-256 in docs/world/quality-v3/nature-v4/manifest.json.
The added geometry goes to leaf-cluster layering and silhouette (trees/bushes) and to strata,
bevels and fracture structure (rocks); targets are declared per asset in TARGET below.

Blender Z-up metres, +X front; the glTF exporter converts to +Y up once.
Nodes: tree root(empty) -> trunk, crown; bush root -> crown; rock root -> rock.

Construction (relationship per skills/blender-connected-refinement):
  * wood: trunk (root flare) + primary limbs + twigs = lofted tubes, Exact Boolean
    UNION -> one continuous closed shell; cut flat at ground.
  * clump cores: closed lumpy shells, embedded in each other and in the limb tips
    (distinct parts, NOT welded).
  * leaves: 6-triangle folded blades whose petiole vertex is buried inside a core
    (embedded, open single-sided cards rendered double-sided).
  * rocks: hull -> planar fracture cuts -> Exact Boolean step notch -> 1-segment bevel.

_WIND point attribute (VEC4 float, see docs/world/quality-v2/nature/PLAN-interface-*.md):
  x bend (ground 0 -> top, quadratic, scaled by height), y branch (0 on trunk, 0->1
  along each primary limb, clump/leaves inherit tip value), z leaf flutter (petiole 0,
  tip 1), w = (primary-limb group + 0.5)/8, trunk 0.
"""
import bpy, bmesh, math, json, os, sys, random
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
BLEND_DIR = os.path.join(HERE, 'blend')
# Target ~2N, N = pre-v4 GLB reimport triangles (spec 11.2). Calibrated, not a hard quota.
BASE_N = {'G16': 4288, 'G17': 3190, 'G18': 3860, 'G19': 990, 'G20': 1744, 'G21': 244, 'G22': 222, 'G23': 162}
TARGET = {k: 2 * v for k, v in BASE_N.items()}
# Staging first; promote_v4.py copies QA-passed GLBs into public/assets/world/camp.
GLB_DIR = os.environ.get('NATURE_V4_GLB_DIR') or os.path.join(HERE, 'staging')

PALETTE = {   # name: (sRGB hex, materialRole, roughness, double-sided)
    'foliage_dark':  ('#6F8A3A', 'foliage', 0.9, True),
    'foliage_mid':   ('#8AA24A', 'foliage', 0.9, True),
    'foliage_light': ('#A9B35A', 'foliage', 0.88, True),
    'wood_trunk':    ('#5A4634', 'wood', 0.95, False),
    'stone_base':    ('#8C8276', 'stone', 0.96, False),
    'stone_top':     ('#B4A896', 'stone', 0.94, False),
    # v4 weathering: both are existing frozen-palette values (ash bed / canopy dark).
    'stone_weathered': ('#5B5650', 'stone', 0.97, False),
    'stone_moss':    ('#6F8A3A', 'moss', 0.95, False),
}
FOL = ['foliage_dark', 'foliage_mid', 'foliage_light']
PART_WOOD, PART_CORE, PART_LEAF, PART_ROCK = 0, 1, 2, 3


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def get_material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hexv, role, rough, double = PALETTE[name]
    h = hexv.lstrip('#')
    lin = tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = (*lin, 1.0)
    m.use_backface_culling = not double   # exporter -> glTF doubleSided
    m['materialRole'] = role
    m['srgbHex'] = hexv
    return m


# ------------------------------------------------------------------ geometry
class Acc:
    """Accumulates triangles with per-vertex wind and per-face material/part."""
    def __init__(self):
        self.bm = bmesh.new()
        self.wind = {}          # BMVert -> (x,y,z,w)
        self.part = self.bm.faces.layers.int.new('part_kind')

    def add_bm(self, src, mat, part, wind_fn):
        vmap = {}
        for v in src.verts:
            nv = self.bm.verts.new(v.co)
            vmap[v] = nv
            self.wind[nv] = wind_fn(v.co)
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mat if isinstance(mat, int) else mat(f)
            nf[self.part] = part
        return vmap


def catmull(points, per_seg=3):
    """points: [(Vector, r)] -> densified [(Vector, r, t)] with t in [0,1] arc param."""
    P = [p for p, _ in points]; R = [r for _, r in points]
    out = []
    n = len(P)
    for i in range(n - 1):
        p0 = P[i - 1] if i > 0 else P[i] * 2 - P[i + 1]
        p3 = P[i + 2] if i + 2 < n else P[i + 1] * 2 - P[i]
        p1, p2 = P[i], P[i + 1]
        for k in range(per_seg):
            t = k / per_seg
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append([p, R[i] + (R[i + 1] - R[i]) * t])
    out.append([P[-1], R[-1]])
    L = [0.0]
    for a, b in zip(out, out[1:]):
        L.append(L[-1] + (b[0] - a[0]).length)
    return [(p, r, L[i] / L[-1]) for i, (p, r) in enumerate(out)]


def tube(rings, sides, seed, lobes=None):
    """rings: [(Vector, r, t)] -> closed capped tube (parallel transported frames).
    lobes: optional fn(t) -> amplitude for 4-lobe root flare."""
    rng = random.Random(seed)
    a0 = rng.uniform(0, 6.283)
    bm = bmesh.new()
    loops, u = [], None
    for i, (c, r, t) in enumerate(rings):
        d = (rings[i + 1][0] - c) if i < len(rings) - 1 else (c - rings[i - 1][0])
        d.normalize()
        u = d.orthogonal().normalized() if u is None else (u - d * u.dot(d)).normalized()
        w = d.cross(u)
        lob = lobes(t) if lobes else 0.0
        ring = []
        for k in range(sides):
            a = a0 + 2 * math.pi * k / sides
            rr = r * (1 + lob * math.cos(4 * a))
            ring.append(bm.verts.new(c + (u * math.cos(a) + w * math.sin(a)) * rr))
        loops.append(ring)
    for A, B in zip(loops, loops[1:]):
        for k in range(sides):
            bm.faces.new([A[k], A[(k + 1) % sides], B[(k + 1) % sides], B[k]])
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def blob(center, radii, seed, subdiv=2, lump=0.07, under=0.8, cut_z=None):
    """Closed clump core: low-frequency lumps (no per-face noise), flatter underside."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rot = Euler((rng.uniform(0, 6.283), rng.uniform(0, 6.283), rng.uniform(0, 6.283))).to_matrix()
    ph = [rng.uniform(0, 6.283) for _ in range(3)]
    for v in bm.verts:
        n = (rot @ v.co).normalized()
        f = 1 + lump * (math.sin(2.7 * n.x + ph[0]) + math.sin(2.7 * n.y + ph[1]) + math.sin(2.7 * n.z + ph[2])) / 3
        p = n * f
        if p.z < 0:
            p.z *= under
        v.co = Vector((p.x * radii[0] + center[0], p.y * radii[1] + center[1], p.z * radii[2] + center[2]))
    if cut_z is not None:
        cut_below(bm, cut_z, min(radii))
    return bm


def cut_below(bm, z, scale):
    eps = 0.03 * scale
    for v in bm.verts:
        if abs(v.co.z - z) < eps:
            v.co.z = z
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z),
                           plane_no=(0, 0, 1), clear_inner=True, dist=1e-6)
    res = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(bm, faces=res['faces'], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def bm_obj(bm, name, mats=()):
    me = bpy.data.meshes.new(name)
    for n in mats:
        me.materials.append(get_material(n))
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ellipsoid_inside(p, c, r, margin=0.0):
    q = Vector(((p.x - c[0]) / r[0], (p.y - c[1]) / r[1], (p.z - c[2]) / r[2]))
    return q.length < 1.0 - margin


# --------------------------------------------------------------------- leaves
def leaf_bm(base, axis, normal, length, width, fold):
    """Rounded 6-triangle blade: petiole P, shoulders L1/R1, widest L2/R2, tip T,
    raised midrib point M. Lies roughly tangent to the clump (shingled)."""
    b = axis.cross(normal).normalized()
    bm = bmesh.new()
    P = bm.verts.new(base)
    L1 = bm.verts.new(base + axis * length * 0.22 + b * width * 0.36)
    R1 = bm.verts.new(base + axis * length * 0.22 - b * width * 0.36)
    L2 = bm.verts.new(base + axis * length * 0.58 + b * width * 0.5 - normal * width * 0.05)
    R2 = bm.verts.new(base + axis * length * 0.58 - b * width * 0.5 - normal * width * 0.05)
    M = bm.verts.new(base + axis * length * 0.45 + normal * width * fold)
    T = bm.verts.new(base + axis * length - normal * width * 0.06)
    for tri in ((P, M, L1), (P, R1, M), (L1, M, L2), (R1, R2, M), (M, T, L2), (M, R2, T)):
        bm.faces.new(tri)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(normal) < 0:
            f.normal_flip()
    return bm, {P: 0.0, L1: 0.25, R1: 0.25, M: 0.45, L2: 0.6, R2: 0.6, T: 1.0}


def fib_dirs(n, seed):
    rng = random.Random(seed)
    off = rng.uniform(0, 6.283)
    g = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(max(0.0, 1 - z * z))
        a = off + g * i
        out.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    return out


def add_clump(acc, clump, all_shells, rng, leaf_len, leaf_w, wind_base, ground=None, leaf_scale_down=0.55, fan=1, density_scale=1.0):
    """clump: dict(c, r, tier, subs=[(c, r)], y, w). Adds cores + leaves; returns core shells.
    v4: each surface site carries a sprig of `fan` blades sharing one buried petiole point and
    fanned about the local normal, so the crown edge reads as leaf clusters, not single cards."""
    tier = ['dark', 'mid', 'light'].index(clump['tier'])
    shells = [(clump['c'], clump['r'])] + clump['subs']
    core_tier = max(0, tier - 1)   # inner/core one step darker -> depth
    for i, (c, r) in enumerate(shells):
        b = blob(c, r, rng.randint(0, 10 ** 6), cut_z=ground)
        acc.add_bm(b, core_tier, PART_CORE, lambda co: wind_base(co, 0.0))
        b.free()
    leaves = 0
    for (c, r) in shells:
        area = 4 * math.pi * ((r[0] * r[1] + r[1] * r[2] + r[0] * r[2]) / 3)
        n = int(area * clump.get('density', 16.0) * density_scale)
        for d in fib_dirs(n, rng.randint(0, 10 ** 6)):
            if d.z < -0.35 and rng.random() < 0.8:
                continue
            surf = Vector((c[0] + d.x * r[0], c[1] + d.y * r[1], c[2] + d.z * r[2] * (0.8 if d.z < 0 else 1.0)))
            # hidden inside another shell (same clump or neighbours)?
            if any(ellipsoid_inside(surf, c2, r2, 0.06) for (c2, r2) in all_shells if (c2, r2) != (c, r)):
                continue
            nrm = Vector((d.x / r[0], d.y / r[1], d.z / r[2])).normalized()
            tang = (nrm.orthogonal() * math.cos(rng.uniform(0, 6.283)) + nrm.cross(nrm.orthogonal()) * math.sin(rng.uniform(0, 6.283)))
            # mostly tangent, slightly outward and drooping -> overlapping shingles
            axis = (tang.normalized() * 0.85 + nrm * 0.38 + Vector((0, 0, -0.22))).normalized()
            if axis.dot(nrm) < 0.15:
                axis = (axis + nrm * 0.3).normalized()
            s0 = rng.uniform(0.82, 1.18) * (leaf_scale_down if d.z < -0.2 else 1.0)
            base = surf - nrm * 0.10   # petiole buried in the core
            if ground is not None and base.z < ground + 0.04:
                continue
            # sun-facing leaves one tier lighter, under-side one darker
            lt = min(2, tier + 1) if nrm.z > 0.45 else (max(0, tier - 1) if nrm.z < -0.15 else tier)
            k = fan if fan == 1 else rng.choice([fan - 1, fan, fan])
            for j in range(k):
                # fan about the normal; the centre blade is longest, side blades shorter/lifted
                off = 0.0 if k == 1 else (j - (k - 1) / 2) / max(1, (k - 1) / 2)
                ax = (Matrix.Rotation(off * 0.62 + rng.uniform(-0.12, 0.12), 3, nrm) @ axis)
                ax = (ax + nrm * abs(off) * 0.16).normalized()
                bn = (nrm - ax * nrm.dot(ax)).normalized()
                s = s0 * (1.0 - 0.2 * abs(off)) * rng.uniform(0.93, 1.07)
                lb, tipw = leaf_bm(base, ax, bn, leaf_len * s, leaf_w * s, 0.12)
                if ground is not None and min(v.co.z for v in lb.verts) < ground + 0.02:
                    lb.free(); continue
                # alternate blades of a sprig one tier apart -> visible layering inside a cluster
                mt = lt if j % 2 == 0 or k == 1 else (min(2, lt + 1) if nrm.z > 0 else max(0, lt - 1))
                vm = {}
                for v in lb.verts:
                    nv = acc.bm.verts.new(v.co)
                    vm[v] = nv
                    acc.wind[nv] = wind_base(v.co, tipw[v])
                for f in lb.faces:
                    nf = acc.bm.faces.new([vm[v] for v in f.verts])
                    nf.material_index = mt
                    nf[acc.part] = PART_LEAF
                lb.free()
                leaves += 1
    return leaves


# ---------------------------------------------------------------------- trees
# Clump: c, r(radii), tier, limb (index of primary limb carrying it).
# Limb: list of control points (x,y,z,r) from the trunk axis outwards; 'twigs'
# connect the limb to the clump sub-shells. Designs are in Blender coords:
# X = GLB X (front), Y = GLB -Z (width axis), Z up.
TREES = {
    # Round broadleaf: leader + three limbs fanning at ~2 m into three separated
    # side clumps under a top clump; gaps between side clumps show the limbs.
    'G16': dict(title='round-crown broadleaf (4 clumps, fan of 3 limbs + leader)', seed=16, H=5.4, W=3.8,
        trunk=[(0, 0, -0.12, 0.40), (0, 0, 0.22, 0.34), (0.03, 0.0, 1.0, 0.29), (0.05, 0.02, 1.8, 0.25), (0.06, 0.03, 2.2, 0.21)],
        flare=0.2,
        limbs=[
            dict(pts=[(0.06, 0.03, 2.1, 0.17), (0.05, 0.0, 3.1, 0.13), (0.02, 0.0, 3.85, 0.09)], clump=0),
            dict(pts=[(0.05, 0.02, 1.85, 0.15), (0.55, -0.1, 2.3, 0.12), (1.05, -0.12, 2.85, 0.08)], clump=1),
            dict(pts=[(0.04, 0.02, 1.95, 0.15), (-0.25, 0.5, 2.45, 0.12), (-0.5, 0.9, 3.0, 0.08)], clump=2),
            dict(pts=[(0.04, 0.02, 1.75, 0.15), (-0.28, -0.45, 2.25, 0.12), (-0.52, -0.88, 2.8, 0.08)], clump=3),
        ],
        clumps=[
            dict(c=(0.0, 0.0, 4.3), r=(1.0, 0.98, 0.86), tier='mid'),
            dict(c=(1.2, -0.14, 3.25), r=(0.8, 0.78, 0.72), tier='light'),
            dict(c=(-0.6, 1.05, 3.4), r=(0.8, 0.78, 0.72), tier='mid'),
            dict(c=(-0.62, -1.02, 3.15), r=(0.78, 0.76, 0.7), tier='dark'),
        ]),
    # Spreading: short trunk, two long low near-horizontal limbs along the width
    # axis; flat-topped umbrella with open space under the limbs.
    'G17': dict(title='low spreading crown (3 clumps on two long side limbs)', seed=17, H=4.8, W=4.4,
        trunk=[(0, 0, -0.12, 0.42), (0, 0, 0.22, 0.36), (-0.03, 0.02, 0.9, 0.31), (-0.05, 0.03, 1.45, 0.28)],
        flare=0.22,
        limbs=[
            dict(pts=[(-0.05, 0.03, 1.3, 0.2), (-0.04, 0.02, 2.4, 0.15), (0.0, 0.0, 3.2, 0.1)], clump=0),
            dict(pts=[(-0.05, 0.03, 1.35, 0.19), (0.05, -0.65, 1.85, 0.15), (0.2, -1.25, 2.3, 0.11), (0.3, -1.6, 2.65, 0.08)], clump=1),
            dict(pts=[(-0.05, 0.03, 1.4, 0.19), (-0.12, 0.66, 1.9, 0.15), (-0.24, 1.25, 2.35, 0.11), (-0.32, 1.6, 2.7, 0.08)], clump=2),
        ],
        clumps=[
            dict(c=(0.0, 0.0, 3.7), r=(1.2, 1.1, 0.78), tier='mid'),
            dict(c=(0.38, -1.7, 3.05), r=(0.9, 0.88, 0.66), tier='dark'),
            dict(c=(-0.38, 1.7, 3.1), r=(0.88, 0.86, 0.66), tier='light'),
        ]),
    # Upward fork: trunk splits at ~2.1 m into a V of two ascending stems along
    # the (1,1) diagonal; clumps sit on the outer sides, the V stays open.
    'G18': dict(title='tall upward-forking crown (5 clumps on a V of two stems)', seed=18, H=6.3, W=3.0,
        trunk=[(0, 0, -0.12, 0.38), (0, 0, 0.22, 0.33), (0.02, 0.0, 1.2, 0.28), (0.03, 0.02, 1.9, 0.25), (0.03, 0.02, 2.2, 0.23)],
        flare=0.2,
        limbs=[
            dict(pts=[(0.03, 0.02, 2.05, 0.19), (0.3, 0.3, 2.9, 0.15), (0.48, 0.46, 3.9, 0.12), (0.42, 0.4, 5.0, 0.09)], clump=4,
                 twigs=[(0.3, 3), (0.62, 2)]),
            dict(pts=[(0.03, 0.02, 2.1, 0.18), (-0.3, -0.28, 2.85, 0.14), (-0.5, -0.48, 3.6, 0.11), (-0.5, -0.46, 4.2, 0.08)], clump=1,
                 twigs=[(0.4, 0)]),
        ],
        clumps=[
            dict(c=(-0.92, -0.8, 3.3), r=(0.56, 0.55, 0.52), tier='dark', limb=1),
            dict(c=(-0.55, -0.52, 4.45), r=(0.64, 0.62, 0.6), tier='mid', limb=1),
            dict(c=(0.62, 0.66, 4.55), r=(0.62, 0.6, 0.58), tier='light', limb=0),
            dict(c=(0.95, 0.82, 3.5), r=(0.56, 0.55, 0.52), tier='mid', limb=0),
            dict(c=(0.36, 0.34, 5.6), r=(0.66, 0.64, 0.66), tier='light', limb=0),
        ]),
}


def make_subs(clump, rng, k=3):
    """Sub-shells bulge from the upper/outer side -> notched, non-spherical silhouette."""
    c, r = Vector(clump['c']), clump['r']
    subs = []
    base_a = rng.uniform(0, 6.283)
    for i in range(k):
        a = base_a + 2 * math.pi * i / k + rng.uniform(-0.4, 0.4)
        el = rng.uniform(0.15, 0.75)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        s = rng.uniform(0.5, 0.62)
        sc = (c.x + d.x * r[0] * 0.62, c.y + d.y * r[1] * 0.62, c.z + d.z * r[2] * 0.6)
        subs.append((sc, (r[0] * s, r[1] * s, r[2] * s * 0.95)))
    return subs


def boolean_union(base, others):
    for o in others:
        m = base.modifiers.new(o.name, 'BOOLEAN')
        m.operation = 'UNION'; m.solver = 'EXACT'; m.object = o
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    for o in others + [base]:
        bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    return bm


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length, t


TREE_LEAF = {'G16': (0.36, 0.25, 3), 'G17': (0.34, 0.24, 3), 'G18': (0.32, 0.22, 3)}
TREE_SUBS = {'G16': 5, 'G17': 5, 'G18': 4}


def build_tree(aid, spec, scale_xy=1.0, dz=0.0, density_scale=1.0):
    rng = random.Random(spec['seed'])
    H = spec['H']
    def S(p):   # crown design transform: XY spread about the trunk axis + lift
        return Vector((p[0] * scale_xy, p[1] * scale_xy, p[2] + dz))
    clumps = []
    for i, cl in enumerate(spec['clumps']):
        c = S(cl['c']); r = (cl['r'][0] * scale_xy, cl['r'][1] * scale_xy, cl['r'][2])
        d = dict(c=tuple(c), r=r, tier=cl['tier'], limb=cl.get('limb'))
        d['subs'] = make_subs(d, rng, k=TREE_SUBS[aid])
        clumps.append(d)

    # skeleton polylines for wind assignment: (densified rings, y0, y1, group)
    skel = []
    tubes = []
    # Keep the visible trunk/root flare below one sixth of the frontal crown width.
    wood_scale = {'G16': .65, 'G17': .80, 'G18': .55}[aid]
    trunk_pts = [(Vector(p[:3]), p[3] * wood_scale) for p in spec['trunk']]
    tr = catmull(trunk_pts, 3)
    fl = spec['flare']
    tubes.append(bm_obj(tube(tr, 9, spec['seed'], lobes=lambda t: fl * max(0.0, 1 - t * 4.5)), aid + '_trunk_src'))
    skel.append((tr, 0.0, 0.0, 0))
    for li, limb in enumerate(spec['limbs']):
        pts = []
        for j, p in enumerate(limb['pts']):
            v = Vector(p[:3])
            if j > 0:   # limbs scale with the crown, bases stay on the trunk
                f = j / (len(limb['pts']) - 1)
                v = v.lerp(S(p[:3]), f)
            pts.append((v, p[3] * wood_scale))
        cl = clumps[limb['clump']]
        # extend into the clump core (tip buried at ~45% radius from the centre)
        c = Vector(cl['c']); last = pts[-1][0]
        dirv = (c - last)
        if dirv.length > 1e-6:
            tip = c - dirv.normalized() * min(cl['r']) * 0.45
            if (tip - last).length > 0.15:
                pts.append((tip, pts[-1][1] * 0.8))
        rings = catmull(pts, 3)
        tubes.append(bm_obj(tube(rings, 7, spec['seed'] * 10 + li), f'{aid}_limb{li}'))
        group = li + 1
        skel.append((rings, 0.0, 1.0, group))
        cl['y'] = 1.0; cl['w'] = group
        for (tparam, ci) in limb.get('twigs', []):
            # twig from the limb at arc param tparam into clump ci
            k = min(range(len(rings)), key=lambda i: abs(rings[i][2] - tparam))
            a, ra = rings[k][0], rings[k][1] * 0.75
            c2 = Vector(clumps[ci]['c'])
            tip = c2 - (c2 - a).normalized() * min(clumps[ci]['r']) * 0.45
            mid = a.lerp(tip, 0.5) + Vector((0, 0, 0.12))
            tw = catmull([(a, ra), (mid, ra * 0.8), (tip, ra * 0.55)], 3)
            tubes.append(bm_obj(tube(tw, 6, spec['seed'] * 100 + ci), f'{aid}_twig{ci}'))
            y0 = rings[k][2]
            skel.append((tw, y0, min(1.0, y0 + 0.35), group))
            clumps[ci]['y'] = min(1.0, y0 + 0.35); clumps[ci]['w'] = group
    wood = boolean_union(tubes[0], tubes[1:])
    bmesh.ops.triangulate(wood, faces=wood.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    cut_below(wood, 0.0, 0.3)

    def wind_for(co, y, w, leaf):
        bend = min(1.0, max(0.0, co.z / H)) ** 2
        return (bend, y, leaf, (w + 0.5) / 8 if w else 0.0)

    def wood_wind(co):
        best = (1e9, 0.0, 0)
        for rings, y0, y1, g in skel:
            for (a, _, ta), (b, _, tb) in zip(rings, rings[1:]):
                d, t = seg_dist(co, a, b)
                if d < best[0]:
                    tt = ta + (tb - ta) * t
                    best = (d, y0 + (y1 - y0) * tt, g)
        return wind_for(co, best[1], best[2], 0.0)

    acc_w = Acc()
    acc_w.add_bm(wood, 0, PART_WOOD, wood_wind)
    wood.free()

    acc_c = Acc()
    all_shells = [s for cl in clumps for s in [(cl['c'], cl['r'])] + cl['subs']]
    nleaves = 0
    ll, lw, fan = TREE_LEAF[aid]
    for cl in clumps:
        y, w = cl.get('y', 1.0), cl.get('w', 0)
        nleaves += add_clump(acc_c, cl, all_shells, rng, ll, lw,
                             lambda co, leaf, y=y, w=w: wind_for(co, y, w, leaf), fan=fan, density_scale=density_scale)
    return acc_w, acc_c, clumps, nleaves


# --------------------------------------------------------------------- bushes
BUSHES = {
    'G19': dict(title='single-mound bush, layered leaves', seed=19, mounds=[dict(c=(0, 0, 0.36), r=(0.66, 0.6, 0.56), tier='mid')]),
    'G20': dict(title='double-mound bush, layered leaves', seed=20, mounds=[
        dict(c=(0.1, -0.36, 0.4), r=(0.64, 0.6, 0.58), tier='mid'),
        dict(c=(-0.05, 0.5, 0.28), r=(0.48, 0.46, 0.42), tier='dark'),
    ]),
}


def build_bush(aid, spec, density_scale=1.0):
    rng = random.Random(spec['seed'])
    clumps = []
    for m in spec['mounds']:
        d = dict(c=m['c'], r=m['r'], tier=m['tier'], density=26.0)
        d['subs'] = make_subs(d, rng, k=5)
        clumps.append(d)
    all_shells = [s for cl in clumps for s in [(cl['c'], cl['r'])] + cl['subs']]
    H = max(c[2] + r[2] for cl in clumps for (c, r) in [(cl['c'], cl['r'])] + cl['subs']) + 0.12
    acc = Acc()
    n = 0
    for gi, cl in enumerate(clumps):
        def wind(co, leaf, gi=gi):
            bend = (min(1.0, max(0.0, co.z / H)) ** 2) * min(1.0, H / 5.0)
            return (bend, 0.25 * min(1.0, co.z / H), leaf, (gi + 1.5) / 8)
        n += add_clump(acc, cl, all_shells, rng, 0.25, 0.175, wind, ground=0.0, leaf_scale_down=0.8, fan=3, density_scale=density_scale)
    return acc, clumps, n


# ---------------------------------------------------------------------- rocks
# W = Blender Y (GLB width z), D = Blender X (GLB depth x), H up.
ROCKS = {
    'G21': dict(title='large rock: two fracture faces + shoulder step', W=2.8, D=2.2, H=1.5, seed=2101, lean=(0.08, -0.05),
                cuts=[(0.4, 0.12, 0.26), (3.3, 0.5, 0.2), (1.9, 0.28, 0.14), (5.1, 0.7, 0.12)], notch=dict(at=(0.3, -0.32, 0.95), size=(0.62, 0.62, 0.62), rot=(0.08, -0.05, 0.5)),
                bevel=0.06, strata=[0.26, 0.5, 0.72], ledge=0.05),
    'G22': dict(title='medium rock: slanted fracture + side notch', W=1.6, D=1.3, H=0.85, seed=2201, lean=(-0.08, 0.07),
                cuts=[(2.2, 0.3, 0.3), (4.6, 0.45, 0.16), (0.7, 0.2, 0.12)], notch=dict(at=(-0.3, 0.32, 0.92), size=(0.6, 0.6, 0.6), rot=(-0.06, 0.08, 0.9)),
                bevel=0.04, strata=[0.34, 0.64], ledge=0.045),
    'G23': dict(title='small rock: rounded block with one fracture face', W=0.8, D=0.65, H=0.4, seed=2301, lean=(0.06, 0.08),
                cuts=[(5.0, 0.35, 0.28), (2.0, 0.5, 0.14), (3.4, 0.25, 0.1)], notch=None, bevel=0.025, strata=[0.4, 0.7], ledge=0.035),
}


def rock_bm(spec):
    rng = random.Random(spec['seed'])
    pts = []
    # v4: denser hull (9/9/8/5 + cap) so cuts and ledges have facets to work with
    rings = [(0.0, 9, 0.95), (0.3, 9, 1.0), (0.66, 8, 0.8), (0.9, 5, 0.46)]
    for t, n, rs in rings:
        a0 = rng.uniform(0, 6.283)
        for k in range(n):
            a = a0 + 2 * math.pi * k / n + rng.uniform(-0.18, 0.18)
            r = rs * (1 + rng.uniform(-0.08, 0.08))
            z = 0.0 if t == 0 else t * (1 + rng.uniform(-0.05, 0.05))
            pts.append(Vector((math.cos(a) * 0.5 * r + spec['lean'][0] * t, math.sin(a) * 0.5 * r + spec['lean'][1] * t, z)))
    pts.append(Vector((spec['lean'][0], spec['lean'][1], 1.0)))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # planar fracture faces: chop a slab off with a tilted plane (unit-box space)
    for az, tilt, depth in spec['cuts']:
        n = Vector((math.cos(az) * math.cos(tilt), math.sin(az) * math.cos(tilt), math.sin(tilt))).normalized()
        mx = max(v.co.dot(n) for v in bm.verts)
        co = n * (mx - depth * 0.5)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=co, plane_no=n,
                               clear_outer=True, dist=1e-6)
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(4), use_dissolve_boundaries=False, verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def fit_bbox(bm, D, W, H):
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    sx, sy, sz = D / (max(xs) - min(xs)), W / (max(ys) - min(ys)), H / (max(zs) - min(zs))
    cx, cy, z0 = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    for v in bm.verts:
        v.co = Vector(((v.co.x - cx) * sx, (v.co.y - cy) * sy, (v.co.z - z0) * sz))


def add_strata(bm, spec):
    """Sedimentary ledges: two close bisect loops per stratum; everything above the upper loop
    steps inward (and the band between becomes a narrow sloped ledge), giving layered profiles."""
    H = spec['H']
    for k, t in enumerate(spec.get('strata', [])):
        z0, z1 = t * H, t * H + 0.035 * H
        for z in (z0, z1):
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z), plane_no=(0, 0, 1), dist=1e-5)
        cx = sum(v.co.x for v in bm.verts) / len(bm.verts); cy = sum(v.co.y for v in bm.verts) / len(bm.verts)
        inset = spec.get('ledge', 0.04) * (1.0 - 0.25 * k)
        for v in bm.verts:
            if v.co.z > z1 + 1e-4:
                d = Vector((v.co.x - cx, v.co.y - cy, 0))
                l = d.length
                if l > 1e-6:
                    v.co -= d / l * min(inset, l * 0.15)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def build_rock(aid, spec):
    bm = rock_bm(spec)
    fit_bbox(bm, spec['D'], spec['W'], spec['H'])
    add_strata(bm, spec)
    if spec['notch']:
        n = spec['notch']
        rock = bm_obj(bm, aid + '_src'); bm.free()
        cut = bmesh.new(); bmesh.ops.create_cube(cut, size=1.0)
        sx, sy, sz = n['size']
        bmesh.ops.scale(cut, vec=(sx * spec['D'], sy * spec['W'], sz * spec['H']), verts=cut.verts)
        bmesh.ops.rotate(cut, verts=cut.verts, cent=(0, 0, 0), matrix=Euler(n['rot']).to_matrix())
        at = n['at']
        bmesh.ops.translate(cut, verts=cut.verts, vec=(at[0] * spec['D'], at[1] * spec['W'], at[2] * spec['H']))
        cutter = bm_obj(cut, aid + '_notch'); cut.free()
        m = rock.modifiers.new('notch', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.solver = 'EXACT'; m.object = cutter
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(rock.evaluated_get(dg))
        bpy.data.objects.remove(rock); bpy.data.objects.remove(cutter)
        bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2), use_dissolve_boundaries=False, verts=bm.verts, edges=bm.edges)
    # moderate one-segment bevel on hard edges only (weathered, not sharp)
    hard = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(34)]
    sharp = [e for e in hard if e.calc_face_angle(0) > math.radians(58)]
    soft = [e for e in hard if e not in set(sharp)]
    if sharp:
        bmesh.ops.bevel(bm, geom=sharp, offset=spec['bevel'] * 1.3, offset_type='OFFSET', segments=2,
                        profile=0.6, affect='EDGES', clamp_overlap=True)
    soft = [e for e in soft if e.is_valid]
    if soft:
        bmesh.ops.bevel(bm, geom=soft, offset=spec['bevel'], offset_type='OFFSET', segments=1,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    # G21 Exact Boolean/bevel produced three vertices within 7e-8 m. Collapse only
    # numerical duplicates (1 micrometre), then retriangulate the generator result.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fit_bbox(bm, spec['D'], spec['W'], spec['H'])
    bm.normal_update()
    # 0 base, 1 lit top, 2 weathered (overhangs + damp lower band), 3 moss (up-facing upper
    # faces on the shaded north-ish side, low-frequency patch, never the whole cap)
    rng = random.Random(spec['seed'] + 7)
    ph = rng.uniform(0, 6.283)
    H = spec['H']
    up = []
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal
        if c.z < 0.01 * H and n.z < -0.9:
            f.material_index = 0          # hidden ground cap
        elif n.z < -0.08 or (c.z < 0.16 * H and abs(n.z) < 0.5):
            f.material_index = 2          # weathered: overhangs + damp lower band
        elif n.z > 0.6:
            f.material_index = 1
        else:
            f.material_index = 0
        if n.z > 0.45 and c.z > 0.4 * H:
            patch = math.sin(c.x * 3.1 / max(spec['D'], 0.3) + ph) + math.sin(c.y * 2.7 / max(spec['W'], 0.3) - ph * 0.7) + 0.6 * n.y
            up.append((patch, f.calc_area(), f))
    # moss: the highest-ranked ~15% of upper, up-facing area -> one coherent shaded-side patch
    total = sum(a for _, a, _ in up); acc = 0.0
    for _, area, f in sorted(up, key=lambda t: -t[0]):
        if acc >= 0.15 * total:
            break
        f.material_index = 3; acc += area
    return bm


# -------------------------------------------------------------- object output
def write_obj(acc_or_bm, name, mats, wind=True, used_remap=True):
    if isinstance(acc_or_bm, Acc):
        bm, wmap = acc_or_bm.bm, acc_or_bm.wind
    else:
        bm, wmap = acc_or_bm, None
    if used_remap:
        used = sorted({f.material_index for f in bm.faces})
        remap = {o: i for i, o in enumerate(used)}
        for f in bm.faces:
            f.material_index = remap[f.material_index]
        mats = [mats[i] for i in used]
    bm.verts.index_update()
    vals = [wmap[v] for v in bm.verts] if (wind and wmap is not None) else None
    ob = bm_obj(bm, name, mats)
    ob.data.name = name
    if vals is not None:
        a = ob.data.attributes.new('_WIND', 'FLOAT_COLOR', 'POINT')
        for i, c in enumerate(vals):
            a.data[i].color = c
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob, mats


def recenter_objects(objs):
    pts = [v.co for o in objs for v in o.data.vertices]
    off = Vector(((max(p.x for p in pts) + min(p.x for p in pts)) / 2, (max(p.y for p in pts) + min(p.y for p in pts)) / 2,
                  min(p.z for p in pts)))
    for o in objs:
        o.data.transform(Matrix.Translation(-off))
    return off


def make_root(aid, children, meta):
    root = bpy.data.objects.new(aid, None)
    bpy.context.scene.collection.objects.link(root)
    for c in children:
        c.parent = root
    root['assetId'] = aid
    for k, v in meta.items():
        root[k] = v if isinstance(v, (int, float, str)) else json.dumps(v)
    return root


def hull_points(objs, limit=32):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    hv = [v.co.copy() for v in bm.verts if v.link_faces]
    bm.free()
    # farthest-point sampling keeps the extremes
    chosen = [max(hv, key=lambda p: p.z)]
    while len(chosen) < min(limit, len(hv)):
        chosen.append(max(hv, key=lambda p: min((p - c).length for c in chosen)))
    # Blender (x,y,z) -> GLB (x, z, -y)
    return [[round(p.x, 4), round(p.z, 4), round(-p.y, 4)] for p in chosen]


def tri_count(*accs):
    return sum(len(f.verts) - 2 for a in accs for f in a.bm.faces)


def finish_tree(aid, spec):
    # pass 1 measures the crown, pass 2 fits width/height (leaf size unchanged); then the leaf
    # site density is calibrated (max 4 passes) so the evaluated total lands near TARGET.
    acc_w, acc_c, clumps, n = build_tree(aid, spec)
    zs = [v.co.z for v in acc_c.bm.verts]; xs = [v.co.x for v in acc_c.bm.verts]; ys = [v.co.y for v in acc_c.bm.verts]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    k = (spec['W'] - 0.3) / (span - 0.3)   # leaves (~0.15 per side) do not scale
    dz = spec['H'] - max(zs)
    acc_w.bm.free(); acc_c.bm.free()
    ds = 0.5
    for _ in range(4):
        acc_w, acc_c, clumps, n = build_tree(aid, spec, scale_xy=k, dz=dz, density_scale=ds)
        tris = tri_count(acc_w, acc_c)
        if abs(tris - TARGET[aid]) / TARGET[aid] < 0.04:
            break
        fixed = tri_count(acc_w) + sum(1 for f in acc_c.bm.faces if f[acc_c.part] == PART_CORE)
        ds *= max(0.2, (TARGET[aid] - fixed) / max(1, tris - fixed))
        acc_w.bm.free(); acc_c.bm.free()
    t_ob, t_m = write_obj(acc_w, 'trunk', ['wood_trunk'])
    c_ob, c_m = write_obj(acc_c, 'crown', FOL)
    off = recenter_objects([t_ob, c_ob])
    collider = dict(type='staticTriMesh', sourceNode='trunk', derive='runtime from final GLB geometry and shared instance matrix')
    root = make_root(aid, [t_ob, c_ob], dict(title=spec['title'], kind='tree', clumpCount=len(clumps), leafCount=n,
                                               generator='nature-v4', leafSprigFan=TREE_LEAF[aid][2], leafDensityScale=round(ds, 4),
                                               crownFit=dict(scaleXY=round(k, 4), lift=round(dz, 4)), collider=collider,
                                               windAttribute='_WIND xyzw=bend,branch,leaf,phaseGroup'))
    return root, [t_ob, c_ob]


def finish_bush(aid, spec):
    ds = 0.5
    for _ in range(4):
        acc, clumps, n = build_bush(aid, spec, density_scale=ds)
        tris = tri_count(acc)
        if abs(tris - TARGET[aid]) / TARGET[aid] < 0.04:
            break
        fixed = sum(1 for f in acc.bm.faces if f[acc.part] == PART_CORE)
        ds *= max(0.2, (TARGET[aid] - fixed) / max(1, tris - fixed))
        acc.bm.free()
    ob, m = write_obj(acc, 'crown', FOL)
    off = recenter_objects([ob])
    root = make_root(aid, [ob], dict(title=spec['title'], kind='bush', clumpCount=len(clumps), leafCount=n,
                                     generator='nature-v4', leafSprigFan=3, leafDensityScale=round(ds, 4),
                                     collider=dict(type='sensorHull', sourceNode='crown', derive='runtime convex hull of all crown vertices, shared instance matrix', policy='pass-through horizontal drag zone (quality-v3 spec 11.3); no rigid core'),
                                     windAttribute='_WIND xyzw=bend,branch,leaf,phaseGroup'))
    return root, [ob]


def finish_rock(aid, spec):
    bm = build_rock(aid, spec)
    ob, m = write_obj(bm, 'rock', ['stone_base', 'stone_top', 'stone_weathered', 'stone_moss'], wind=False)
    bm.free()
    recenter_objects([ob])
    root = make_root(aid, [ob], dict(title=spec['title'], kind='rock', generator='nature-v4', strata=len(spec.get('strata', [])),
                                     materials='stone_base/top + weathered underside/lower band + moss patches (frozen palette values)',
                                     collider=dict(type='staticTriMesh', sourceNode='rock', policy='solid; preserve authored notch')))
    return root, [ob]


def export(root, aid):
    os.makedirs(BLEND_DIR, exist_ok=True); os.makedirs(GLB_DIR, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, aid + '.blend'))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(GLB_DIR, aid + '.glb'), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_normals=True, export_materials='EXPORT',
        export_extras=True, export_texcoords=False, export_tangents=False,
        export_vertex_color='NONE', export_attributes=True,
        export_animations=False, export_cameras=False, export_lights=False, export_skins=False,
        export_morph=False, export_image_format='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=20, export_draco_normal_quantization=10,
        export_draco_generic_quantization=12)


def main(ids):
    for aid in ids:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = 'METRIC'
        if aid in TREES:
            root, objs = finish_tree(aid, TREES[aid])
        elif aid in BUSHES:
            root, objs = finish_bush(aid, BUSHES[aid])
        else:
            root, objs = finish_rock(aid, ROCKS[aid])
        export(root, aid)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
        print('BUILT', aid, tris, [o.name for o in objs], root.get('leafCount'))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(argv or ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23'])
