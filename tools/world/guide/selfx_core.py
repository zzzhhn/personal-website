"""Shared triangle self-intersection classifier for G24 QA (imported by qa_selfx.py).

Candidates come from mathutils BVHTree.overlap on triangulated geometry. In Blender 4.2.23 that
callback already runs isect_tri_tri_v3 on every candidate (mathutils_bvhtree.cc L485-513), drops
pairs that share >=2 vertex pointers and, for 1 shared pointer, keeps pairs whose intersection
segment is longer than the tree epsilon. Pointers are per vertex index, so on GLB imports split at
seams, adjacency must come from a welded id (done by the caller).

Strict adjacency (agreed with the main thread's guide_intersections.py --strict-adjacency):
  * share an edge (2 welded vertices)  -> excluded (adjacent faces meet on that edge);
  * share 1 welded vertex              -> kept only if an independent witness point lies more than
                                          SHARED_VERTEX_TOL from the shared vertex;
  * share nothing                      -> kept (the tri-tri test said they intersect).
Witness points are edge/triangle crossings found with clipped segment-triangle tests both ways.
Single-shared-vertex pairs that the float test keeps (crossing or no witness) are then resolved by
the exact rational test from the main thread's guide_intersections.py: the two planes meet in a line
through the shared vertex; its direction is expressed in each triangle's two edge vectors using
Fractions of the evaluated float coordinates. If the coefficient signs show no common ray of that
line inside both triangles, the intersection is the vertex alone -> 'vertex_contact_exact'.
Coplanar/degenerate returns None and the float verdict stands (no tolerance is widened). On GLB
imports the shared vertex's seam copies are snapped to the welded representative first (same source
vertex; Draco copies differ by < 1 um).
Limits: float32 coordinates; coplanar overlaps produce no segment witness and are reported
separately as 'no_witness'; only sampled poses are tested.
"""
from fractions import Fraction
from mathutils import Vector
from mathutils.geometry import intersect_ray_tri

SHARED_VERTEX_TOL = 1e-5


def _seg_tri(p, q, tri):
    d = q - p
    L = d.length
    if L < 1e-12:
        return None
    r = intersect_ray_tri(tri[0], tri[1], tri[2], d / L, p, True)
    if r is None:
        return None
    t = (r - p).dot(d / L)
    return r if -1e-9 <= t <= L + 1e-9 else None


def witnesses(A, B):
    out = []
    for X, Y in ((A, B), (B, A)):
        for i in range(3):
            r = _seg_tri(X[i], X[(i + 1) % 3], Y)
            if r is not None:
                out.append(r)
    return out


def exact_shared_vertex_only(aa, bb, origin_pt):
    """True: intersection is the shared vertex only. False: a segment leaves it. None: unresolved."""
    def sub(a, b): return tuple(x - y for x, y in zip(a, b))
    def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    p, q = [[tuple(Fraction(float(x)) for x in v) for v in tri] for tri in (aa, bb)]
    origin = tuple(Fraction(float(x)) for x in origin_pt)
    direction = cross(cross(sub(p[1], p[0]), sub(p[2], p[0])), cross(sub(q[1], q[0]), sub(q[2], q[0])))
    if not any(direction):
        return None

    def rays(tri):
        edges = [sub(v, origin) for v in tri if v != origin]
        if len(edges) != 2:
            return None
        a, b = edges
        for x, y in ((0, 1), (0, 2), (1, 2)):
            det = a[x] * b[y] - a[y] * b[x]
            if not det:
                continue
            u = (direction[x] * b[y] - direction[y] * b[x]) / det
            v = (a[x] * direction[y] - a[y] * direction[x]) / det
            return {1} if u >= 0 and v >= 0 else {-1} if u <= 0 and v <= 0 else set()
        return None
    left, right = rays(p), rays(q)
    return None if left is None or right is None else not bool(left & right)


def classify(pts, tri_a, tri_b, wa, wb, weld_pos, weld=None):
    """Return (kind, witness_length). kind in {'adjacent_edge','vertex_contact','crossing','no_witness'}.
    wa/wb: welded vertex id sets; weld_pos: welded id -> deformed position."""
    shared = wa & wb
    if len(shared) >= 2:
        return 'adjacent_edge', 0.0
    A = [pts[i] for i in tri_a]
    B = [pts[i] for i in tri_b]
    W = witnesses(A, B)
    span = max(((u - v).length for u in W for v in W), default=0.0)
    if shared:
        sid = next(iter(shared))
        sv = weld_pos[sid]
        if W and all((w - sv).length <= SHARED_VERTEX_TOL for w in W):
            return 'vertex_contact', span
        if weld is not None:
            snap = lambda T: [sv if weld[i] == sid else pts[i] for i in T]
            if exact_shared_vertex_only(snap(tri_a), snap(tri_b), sv) is True:
                return 'vertex_contact_exact', span
        return ('crossing', span) if W else ('no_witness', 0.0)
    return ('crossing', span) if W else ('no_witness', 0.0)
