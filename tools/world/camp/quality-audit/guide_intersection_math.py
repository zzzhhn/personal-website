"""Intersection witnesses shared by native and captured-runtime diagnostics."""
from fractions import Fraction
from mathutils.geometry import intersect_ray_tri
EPS = 1e-6


def intersection_points(aa, bb):
    hits = []
    for source, target in ((aa, bb), (bb, aa)):
        for i in range(3):
            p, q = source[i], source[(i + 1) % 3]
            d = q - p
            if d.length_squared < EPS ** 2:
                continue
            hit = intersect_ray_tri(*target, d, p, True)
            if hit is None:
                continue
            t = (hit - p).dot(d) / d.length_squared
            if -EPS <= t <= 1 + EPS and all((hit - h).length > EPS for h in hits):
                hits.append(hit)
    extent = max(((a - b).length for a in hits for b in hits), default=0.)
    return hits, extent


def exact_shared_vertex_only(aa, bb, shared_point):
    """Resolve a float BVH hit with no ray witness, without increasing tolerance.

    For noncoplanar triangles sharing one vertex, their plane intersection is a
    line through that vertex. Express its direction in each triangle's two edge
    vectors. Opposite coefficient signs mean that triangle contains no nonzero
    segment of the line. Otherwise the signs select one of the line's two rays.
    Fraction preserves the evaluated binary coordinates exactly. None leaves
    coplanar/degenerate cases unresolved, never implicitly clear.
    """
    def sub(a, b): return tuple(x-y for x, y in zip(a, b))
    def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    p, q = [[tuple(Fraction(float(x)) for x in v) for v in tri] for tri in (aa, bb)]
    origin = tuple(Fraction(float(x)) for x in shared_point)
    direction = cross(cross(sub(p[1], p[0]), sub(p[2], p[0])), cross(sub(q[1], q[0]), sub(q[2], q[0])))
    if not any(direction): return None
    def rays(tri):
        edges = [sub(v, origin) for v in tri if v != origin]
        if len(edges) != 2: return None
        a, b = edges
        for x, y in ((0, 1), (0, 2), (1, 2)):
            det = a[x]*b[y]-a[y]*b[x]
            if not det: continue
            u = (direction[x]*b[y]-direction[y]*b[x])/det
            v = (a[x]*direction[y]-a[y]*direction[x])/det
            return ({1} if u >= 0 and v >= 0 else {-1} if u <= 0 and v <= 0 else set())
        return None
    left, right = rays(p), rays(q)
    return None if left is None or right is None else not bool(left & right)
