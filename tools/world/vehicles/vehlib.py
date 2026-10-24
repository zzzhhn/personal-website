"""Shared L1 vehicle modelling library (G25 / G26 / G27).

Blender is Z-up, +X front, +Y = vehicle LEFT (glTF +Z right = Blender -Y). The glTF exporter does the
Y-up conversion once (glTF x = x, y = z, z = -y). Origin: centre of the four tyre contact points, tyre
bottom z = 0, wheel centre z = +r (ART-LOCK v3 shared contract).

Construction vocabulary (all closed shells, outward wound by signed volume):
  loft_y    layered side-profile loft: one (x, z) profile per lateral layer t = |y| / hw, same vertex
            count per layer, mirrored. Gives chamfers (inset outer layer), tumblehome (greenhouse
            collapsed on outer layers), wheel wells (arch only on outer layers) without booleans.
  prism     polygon in (u, v) extruded along d through an arbitrary mapping (u, v, d) -> xyz, used for
            plates that sit on a body surface: door skins (real seams), windows, lamps, grilles.
  lathe     surface of revolution about the wheel axle (tyres, rims, lamps) with smooth shading.
Collision hulls are computed from the same profile functions / shells (spec 5: collision and visual
share a source).
"""
import bpy, bmesh, math, os, json, sys
from mathutils import Vector, Matrix

REPO = os.getcwd()
GLB_DIR = os.path.join(REPO, 'public/assets/world/vehicles')
SRC_DIR = os.path.join(REPO, 'tools/world/vehicles')
BLEND_DIR = os.path.join(SRC_DIR, 'blend')
DOC_DIR = os.path.join(REPO, 'docs/world/vehicles')
EVID_DIR = '/Users/bobby/Desktop/3D-personal-world/evidence/vehicles'
HULL_JSON = os.path.join(REPO, 'src/components/world/WorldVehicleHulls.json')
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=16, export_draco_normal_quantization=12,
             export_draco_generic_quantization=12)

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

# name: (sRGB hex, materialRole, roughness, metallic). Art Lock palette only.
MATS = {
    'veh_paint_slate':   ('#4E647D', 'paint', 0.55, 0.0),
    'veh_paint_cream':   ('#E6DCCB', 'paint', 0.55, 0.0),
    'veh_paint_orange':  ('#E8803A', 'paint', 0.55, 0.0),
    'veh_accent_slate':  ('#4E647D', 'accent', 0.75, 0.0),
    'veh_accent_cream':  ('#E6DCCB', 'accent', 0.70, 0.0),
    'veh_accent_dark':   ('#3A3F47', 'accent', 0.85, 0.0),
    'veh_accent_amber':  ('#E8A03A', 'accent', 0.45, 0.0),
    'veh_rubber':        ('#2A2D31', 'rubber', 0.95, 0.0),
    'veh_glass':         ('#2E4363', 'glass', 0.25, 0.0),
    'veh_metal':         ('#A3A7AA', 'metal', 0.40, 0.55),
    'veh_metal_dark':    ('#3A3F47', 'metal', 0.55, 0.35),
    'veh_light_front':   ('#F3ECDC', 'light_front', 0.20, 0.0),
    'veh_light_brake':   ('#63BEB3', 'light_brake', 0.30, 0.0),
    'veh_light_reverse': ('#ECEBE4', 'light_reverse', 0.25, 0.0),
    'veh_light_beacon':  ('#E8803A', 'light_beacon', 0.30, 0.0),
}

def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hx, role, rough, metal = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_lin(hx)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if role.startswith('light'):
        bsdf.inputs['Emission Color'].default_value = hex_lin(hx)
        bsdf.inputs['Emission Strength'].default_value = 0.6
    m.diffuse_color = hex_lin(hx)
    m.roughness = rough
    m.metallic = metal
    m['materialRole'] = role
    m['srgbHex'] = hx
    return m

# ---------------------------------------------------------------- shells
def signed_volume(faces):
    vol = 0.0
    for f in faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6
    return vol

def orient_outward(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if signed_volume(bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

class Part:
    """One exported mesh object; accumulates closed shells with per-face materials."""
    def __init__(self, name, smooth_angle=34):
        self.name, self.smooth_angle = name, smooth_angle
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def add(self, src, mat=None, face_mats=None):
        """face_mats: list of material names per face (in src face order) overriding mat."""
        src.faces.ensure_lookup_table()
        names = face_mats or [mat] * len(src.faces)
        orient_outward(src)
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f, mname in zip(src.faces, names):
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = self.slot(mname)
        src.free()

    def mirror_add(self, builder, mat=None):
        """builder(s) -> (bm, face_mats|None) for s in (+1 left, -1 right)."""
        for s in (1, -1):
            bm, fm = builder(s)
            self.add(bm, mat, fm)

def _shell_faces_with_mats(bm, mats):
    return bm, mats

# ---------------------------------------------------------------- 2D helpers
def poly_area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

def offset_poly(pts, d, max_miter=2.2):
    """Miter offset of a simple polygon; d > 0 moves edges toward the interior."""
    n, sgn = len(pts), (1 if poly_area(pts) > 0 else -1)
    out = []
    for i in range(n):
        p0, p, p1 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e1, e2 = (p - p0).normalized(), (p1 - p).normalized()
        n1, n2 = Vector((-e1.y, e1.x)) * sgn, Vector((-e2.y, e2.x)) * sgn
        b = n1 + n2
        b = n1 if b.length < 1e-6 else b.normalized()
        m = d / max(b.dot(n1), 1 / max_miter)
        q = p + b * m
        out.append((q.x, q.y))
    return out

def rrect(u0, v0, u1, v1, r, seg=3):
    """Rounded rectangle CCW, r corner radius, seg segments per corner."""
    pts = []
    for cu, cv, a0 in ((u1 - r, v0 + r, -90), (u1 - r, v1 - r, 0), (u0 + r, v1 - r, 90), (u0 + r, v0 + r, 180)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cu + r * math.cos(a), cv + r * math.sin(a)))
    return pts

def earclip(pts):
    """Triangulate a simple polygon [(u, v)] (either winding). Returns index triples in the polygon's
    own winding. Raises if the polygon is not simple enough to clip (generator bug)."""
    n = len(pts)
    idx = list(range(n))
    sgn = 1 if poly_area(pts) > 0 else -1
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c):
        return sgn * cross(a, b, p) >= -1e-12 and sgn * cross(b, c, p) >= -1e-12 and sgn * cross(c, a, p) >= -1e-12
    tris, guard = [], 0
    while len(idx) > 3 and guard < 10 * n * n:
        guard += 1
        best = None
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            area = sgn * cross(a, b, c)
            if area <= 1e-12:
                continue
            if any(inside(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2) and pts[j] not in (a, b, c)):
                continue
            # prefer the fattest ear (fewer slivers)
            e = area / max(1e-12, max((a[0]-b[0])**2+(a[1]-b[1])**2, (b[0]-c[0])**2+(b[1]-c[1])**2, (c[0]-a[0])**2+(c[1]-a[1])**2))
            if best is None or e > best[0]:
                best = (e, k, (i0, i1, i2))
        if best is None:
            # drop a collinear vertex if any, otherwise fail loudly
            for k in range(len(idx)):
                a, b, c = pts[idx[k - 1]], pts[idx[k]], pts[idx[(k + 1) % len(idx)]]
                if abs(cross(a, b, c)) <= 1e-12:
                    idx.pop(k); break
            else:
                raise RuntimeError('earclip: non-simple polygon')
            continue
        tris.append(best[2]); idx.pop(best[1])
    if len(idx) == 3 and sgn * cross(pts[idx[0]], pts[idx[1]], pts[idx[2]]) > 1e-12:
        tris.append(tuple(idx))
    got = sum(abs(cross(pts[a], pts[b], pts[c])) / 2 for a, b, c in tris)
    want = abs(poly_area(pts))
    if abs(got - want) > 1e-6 + want * 1e-4:
        raise RuntimeError(f'earclip area mismatch {got} vs {want}')
    return tris

def cap(bm, verts, uv, reverse):
    """Add a polygon cap as ear-clipped triangles. Returns the number of faces added."""
    tris = earclip(uv)
    for t in tris:
        vs = [verts[i] for i in t]
        bm.faces.new(vs[::-1] if reverse else vs)
    return len(tris)

def circle(cu, cv, r, n=32, ru=None):
    ru = ru or r
    return [(cu + ru * math.cos(2 * math.pi * k / n), cv + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def squircle_arch(cx, z0, half_w, height, n=11, p=3.0, forward=True):
    """Wheel-arch curve from (cx-half_w, z0) over the top to (cx+half_w, z0) (forward=True)."""
    pts = []
    for k in range(n):
        t = math.pi * (1 - k / (n - 1))
        c, s = math.cos(t), math.sin(t)
        x = cx + half_w * math.copysign(abs(c) ** (2 / p), c)
        z = z0 + height * abs(s) ** (2 / p)
        pts.append((x, z))
    return pts if forward else pts[::-1]

# ---------------------------------------------------------------- 3D builders
def prism(poly, mapping, d0, d1, mats=None):
    """Closed prism of polygon poly (u, v) between depths d0, d1 via mapping(u, v, d) -> xyz.
    mats: (cap0, cap1, side) material names or None."""
    bm = bmesh.new()
    A = [bm.verts.new(mapping(u, v, d0)) for u, v in poly]
    B = [bm.verts.new(mapping(u, v, d1)) for u, v in poly]
    fm = []
    c0 = cap(bm, A, poly, True); c1 = cap(bm, B, poly, False)
    if mats:
        fm += [mats[0]] * c0 + [mats[1]] * c1
    n = len(poly)
    for i in range(n):
        bm.faces.new([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]])
        if mats:
            fm.append(mats[2])
    return bm, (fm or None)

def stepped_plate(poly, mapping, d0, d1, bevel, mats=None):
    """Plate with a chamfered top: base prism to d1-bevel and an inset cap layer to d1."""
    inner = offset_poly(poly, bevel)
    bm = bmesh.new()
    A = [bm.verts.new(mapping(u, v, d0)) for u, v in poly]
    B = [bm.verts.new(mapping(u, v, d1 - bevel)) for u, v in poly]
    C = [bm.verts.new(mapping(u, v, d1)) for u, v in inner]
    n = len(poly)
    nc = cap(bm, A, poly, True) + cap(bm, C, inner, False)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([A[i], A[j], B[j], B[i]])
        bm.faces.new([B[i], B[j], C[j], C[i]])
    fm = None
    if mats:
        fm = [mats] * (nc + 2 * n) if isinstance(mats, str) else None
    return bm, fm

def loft_y(profile_fn, ts, hw, mat_fn, cap_mat, yfn=None):
    """profile_fn(t) -> [(x, z)] (same length for every t). Layers at y = +-t*hw, or +-yfn(t, x, z)
    (tumblehome). mat_fn(i, t_outer, centre) gives the material of the strip on profile edge i between
    two layers; cap_mat(centre) or a name for the two outer caps."""
    layers = [-t for t in reversed(ts) if t > 0] + list(ts)
    bm = bmesh.new()
    def yy(s, x, z):
        return math.copysign(yfn(abs(s), x, z), s) if yfn else s * hw
    rings = [[bm.verts.new((x, yy(s, x, z), z)) for x, z in profile_fn(abs(s))] for s in layers]
    n = len(rings[0])
    fm = []
    for ring, s0, rev in ((rings[0], layers[0], False), (rings[-1], layers[-1], True)):
        uv = profile_fn(abs(s0))
        before = len(bm.faces)
        cap(bm, ring, uv, rev)
        bm.faces.ensure_lookup_table()
        for f in list(bm.faces)[before:]:
            fm.append(cap_mat(tuple(f.calc_center_median())) if callable(cap_mat) else cap_mat)
    for k in range(len(layers) - 1):
        to = max(abs(layers[k]), abs(layers[k + 1]))
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])
            fm.append(mat_fn(i, to, tuple(f.calc_center_median())))
    return bm, fm

def lathe(profile, segs, mats=None, closed=True, phase=0.0):
    """Revolve [(r, w)] about the local Y axis (axle). closed: profile is a loop.
    mats: list per profile edge. Points with r == 0 become poles."""
    bm = bmesh.new()
    rings = []
    for r, w in profile:
        if r < 1e-7:
            rings.append([bm.verts.new((0, w, 0))] * segs)
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / segs + phase), w, r * math.sin(2 * math.pi * k / segs + phase))) for k in range(segs)])
    fm = []
    m = len(profile) if closed else len(profile) - 1
    for i in range(m):
        a, b = rings[i], rings[(i + 1) % len(profile)]
        for k in range(segs):
            l = (k + 1) % segs
            q = [a[k], a[l], b[l], b[k]]
            uniq = []
            for v in q:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) >= 3:
                bm.faces.new(uniq)
                fm.append(mats[i] if mats else None)
    return bm, (fm if mats else None)

def xform(bm, mat):
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    return bm

def box(lo, hi, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = (hi[i] - lo[i] for i in range(3))
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=tuple((hi[i] + lo[i]) / 2 for i in range(3)), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', profile_type='SUPERELLIPSE',
                        segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm

def cylinder(p0, p1, r, segs=12, r1=None):
    """Closed cylinder / frustum from p0 to p1."""
    r1 = r if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    bm, _ = lathe([(0, 0), (r, 0), (r1, L), (0, L)], segs, closed=False)
    axis = (p1 - p0).normalized()
    rot = Vector((0, 1, 0)).rotation_difference(axis).to_matrix().to_4x4()
    return xform(bm, Matrix.Translation(p0) @ rot)

def tube_path(points, r, segs=8):
    """Polyline of overlapping cylinders plus small joint spheres-free overlaps (embedded joints)."""
    out = []
    for a, b in zip(points[:-1], points[1:]):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized() * r * 0.9
        out.append(cylinder(a - d, b + d, r, segs))
    return out

def torus(center, axis, R, r, segs=20, rsegs=8):
    prof = [(R + r * math.cos(2 * math.pi * k / rsegs), r * math.sin(2 * math.pi * k / rsegs)) for k in range(rsegs)]
    bm, _ = lathe(prof, segs)
    rot = Vector((0, 1, 0)).rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4()
    return xform(bm, Matrix.Translation(Vector(center)) @ rot)

# ---------------------------------------------------------------- polygon clipping for hulls
def clip_half(poly, inside, inter):
    out = []
    for i in range(len(poly)):
        a, b = poly[i - 1], poly[i]
        ia, ib = inside(a), inside(b)
        if ib:
            if not ia:
                out.append(inter(a, b))
            out.append(b)
        elif ia:
            out.append(inter(a, b))
    return out

def clip_box2(poly, x0, x1, z0):
    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / ((b[0] - a[0]) or 1e-9))
    def iz(zc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zc - a[1]) / ((b[1] - a[1]) or 1e-9), zc)
    p = clip_half(poly, lambda q: q[0] >= x0, ix(x0))
    p = clip_half(p, lambda q: q[0] <= x1, ix(x1)) if p else p
    p = clip_half(p, lambda q: q[1] >= z0, iz(z0)) if p else p
    return p

def hull_points(points):
    """Reduce a point cloud to its convex hull vertices (Blender convex_hull)."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    drop = list({g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)})
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.002)
    pts = [tuple(v.co) for v in bm.verts]
    nf = len(bm.faces)
    bm.free()
    return pts, nf

def loft_hull(profile_fn, ts, hw, x0, x1, zclip):
    pts = []
    for t in ts:
        poly = clip_box2(profile_fn(t), x0, x1, zclip)
        for x, z in poly:
            pts += [(x, t * hw, z), (x, -t * hw, z)]
    return pts

def shell_points(bms_or_parts, zclip, xr=None):
    pts = []
    for bm in bms_or_parts:
        for v in bm.verts:
            x, y, z = v.co
            if xr and not (xr[0] <= x <= xr[1]):
                continue
            pts.append((x, y, max(z, zclip)))
    return pts

# ---------------------------------------------------------------- scene / export / QA
class Hulls:
    """Collision hull point sets, collected from the same shells / profiles that are rendered."""
    def __init__(self):
        self.groups = {}

    def pts(self, group, points):
        self.groups.setdefault(group, []).extend(tuple(p) for p in points)

    def take(self, group, bm, zclip=None):
        self.pts(group, [(v.co.x, v.co.y, max(v.co.z, zclip) if zclip is not None else v.co.z) for v in bm.verts])
        return bm

    def boxpts(self, group, lo, hi):
        self.pts(group, [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])

    def export(self):
        out = []
        for name, pts in self.groups.items():
            hp, nf = hull_points(pts)
            out.append({'part': name, 'faces': nf, 'points': [c for p in hp for c in to_gltf(p)]})
        return out

def build_wheel(name, R, width, rim_r, spokes, rim_mat, hub_mat, segs=36, lugs=5, tread=None, spoke_w=0.032,
                dish_inset=0.022, steel=False):
    """One wheel, axle along Blender Y, outer face toward +Y, centre at origin.
    tread = dict(rows, count, depth, block_frac) for block-tread tyres or None for a ribbed road tyre."""
    part = Part(name, smooth_angle=40)
    hw = width / 2
    depth = tread['depth'] if tread else 0.0
    Rb = R - depth  # tread base radius
    sh = min(0.035, hw * 0.3)
    prof = [(rim_r - 0.01, hw * 0.80), (rim_r + (Rb - rim_r) * 0.35, hw * 0.97), (Rb - sh * 1.2, hw),
            (Rb - sh * 0.35, hw * 0.93), (Rb, hw * 0.72), (Rb, -hw * 0.72), (Rb - sh * 0.35, -hw * 0.93),
            (Rb - sh * 1.2, -hw), (rim_r + (Rb - rim_r) * 0.35, -hw * 0.97), (rim_r - 0.01, -hw * 0.80)]
    if not tread:
        # road tyre: three circumferential ribs (real grooves) instead of blocks
        g = 0.006
        prof = prof[:4] + [(R, hw * 0.72), (R, hw * 0.30), (R - g, hw * 0.26), (R - g, hw * 0.18), (R, hw * 0.14),
                           (R, -hw * 0.14), (R - g, -hw * 0.18), (R - g, -hw * 0.26), (R, -hw * 0.30), (R, -hw * 0.72)] + prof[6:]
    bm, _ = lathe(prof, segs)
    part.add(bm, 'veh_rubber')
    if tread:
        rows, count, frac = tread['rows'], tread['count'], tread['block_frac']
        for row in range(rows):
            v0 = -hw * 0.95 + row * (1.9 * hw / rows) + 0.008
            v1 = v0 + 1.9 * hw / rows - 0.016
            for k in range(count):
                a0 = 2 * math.pi * (k + 0.5 * (row % 2)) / count
                da = 2 * math.pi / count * frac
                # chevron-ish lug: skewed quad in (angle, w)
                sk = da * 0.25 * (1 if row % 2 else -1)
                poly = [(a0, v0), (a0 + da, v0), (a0 + da + sk, v1), (a0 + sk, v1)]
                def m(u, v, d):
                    return (d * math.cos(u), v, d * math.sin(u))
                b, _ = prism(poly, m, Rb - 0.012, R)
                part.add(b, 'veh_rubber')
    # rim lip / barrel (visible ring), back disc (dark), spokes, hub, lugs
    lip = [(rim_r - 0.012, hw * 0.55), (rim_r + 0.012, hw * 0.80), (rim_r + 0.012, hw * 0.92), (rim_r - 0.004, hw * 0.95),
           (rim_r - 0.018, hw * 0.82)]
    iseg = max(20, segs * 2 // 3)
    bm, _ = lathe(lip[:4], iseg)
    part.add(bm, rim_mat)
    face = hw * 0.92 - dish_inset
    part.add(cylinder((0, face - 0.05, 0), (0, face - 0.03, 0), rim_r - 0.006, iseg), 'veh_accent_dark')
    if steel:
        # steel wheel: dished disc with a ring of holes approximated by raised dark ports + chrome hub
        bm, _ = lathe([(0, face - 0.03), (rim_r - 0.01, face - 0.03), (rim_r - 0.01, face - 0.008), (rim_r * 0.72, face - 0.004),
                       (rim_r * 0.55, face + 0.006), (rim_r * 0.30, face + 0.012), (0, face + 0.012)], segs, closed=False)
        part.add(bm, rim_mat)
        for k in range(spokes):
            a = 2 * math.pi * k / spokes
            c = (rim_r * 0.63 * math.cos(a), rim_r * 0.63 * math.sin(a))
            poly = circle(c[0], c[1], rim_r * 0.085, 8)
            b, _ = prism([(p[0], p[1]) for p in poly], lambda u, v, d: (u, d, v), face - 0.012, face + 0.003)
            part.add(b, 'veh_accent_dark')
    else:
        for k in range(spokes):
            a = 2 * math.pi * k / spokes + math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            w0, w1 = spoke_w * 1.25, spoke_w * 0.8
            r0, r1 = rim_r * 0.30, rim_r - 0.008
            loc = [(r0, -w0), (r1, -w1), (r1, w1), (r0, w0)]
            poly = [(r * ca - t * sa, r * sa + t * ca) for r, t in loc]
            b, _ = prism(poly, lambda u, v, d: (u, d, v), face - 0.035, face)
            part.add(b, rim_mat)
        bm, _ = lathe([(0, face - 0.03), (rim_r * 0.36, face - 0.03), (rim_r * 0.36, face + 0.004), (rim_r * 0.24, face + 0.016),
                       (0, face + 0.02)], 16, closed=False)
        part.add(bm, rim_mat)
    part.add(cylinder((0, face + 0.010, 0), (0, face + 0.030, 0), rim_r * 0.13, 12, rim_r * 0.10), hub_mat)
    for k in range(lugs):
        a = 2 * math.pi * (k + 0.5) / lugs + math.pi / 2
        rr = rim_r * 0.24
        part.add(cylinder((rr * math.cos(a), face, rr * math.sin(a)), (rr * math.cos(a), face + 0.022, rr * math.sin(a)), 0.011, 6), 'veh_metal')
    return part

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_object(part, parent):
    me = bpy.data.meshes.new(part.name)
    part.bm.to_mesh(me)
    part.bm.free()
    for mname in part.slots:
        me.materials.append(get_mat(mname))
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(part.smooth_angle))
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    return ob

def to_gltf(p):
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]

def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    e = ob.evaluated_get(dg)
    me = e.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    e.to_mesh_clear()
    return n

def mesh_checks(ob):
    me = ob.data
    me.calc_loop_triangles()
    degenerate = sum(1 for t in me.loop_triangles if t.area < 1e-8)
    bm = bmesh.new(); bm.from_mesh(me)
    nonman = sum(1 for e in bm.edges if not e.is_manifold)
    finite = all(all(math.isfinite(c) for c in v.co) for v in bm.verts)
    vol = signed_volume(bm.faces)
    bm.free()
    return {'tris': len(me.loop_triangles), 'degenerate': degenerate, 'nonManifoldEdges': nonman, 'finite': finite, 'signedVolume': round(vol, 5)}

def world_bounds(objs):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        if ob.type != 'MESH':
            continue
        e = ob.evaluated_get(dg)
        for v in e.data.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return [round(c, 4) for c in lo], [round(c, 4) for c in hi]

def export_glb(asset_id, root, objs):
    os.makedirs(BLEND_DIR, exist_ok=True); os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, f'{asset_id}.blend'), compress=True)
    glb = os.path.join(GLB_DIR, f'{asset_id}.glb')
    rna = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    if any(k not in rna for k in DRACO):
        raise RuntimeError('exporter lacks Draco options')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_normals=True, export_materials='EXPORT', export_texcoords=False,
                              export_tangents=False, export_cameras=False, export_lights=False, export_animations=False,
                              export_extras=True, **DRACO)
    return glb

def reimport_check(glb):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = list(bpy.context.scene.objects)
    meshes = [o for o in objs if o.type == 'MESH']
    lo, hi = world_bounds(meshes)
    return {'objects': sorted(o.name for o in objs), 'tris': {o.name: evaluated_tris(o) for o in meshes},
            'materials': sorted({m.name for o in meshes for m in o.data.materials if m}),
            'bounds': [lo, hi], 'bytes': os.path.getsize(glb)}

def write_hulls(asset_id, info):
    data = {}
    if os.path.exists(HULL_JSON):
        with open(HULL_JSON) as f:
            data = json.load(f)
    data[asset_id] = info
    with open(HULL_JSON, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
        f.write('\n')

# ---------------------------------------------------------------- presentation renders
def render_views(asset_id, root, objs, tag=''):
    """Workbench ortho sheet laid out like the round3-lock references (side, front / rear, top), plus a
    3/4 close view. Presentation copies are created after export and never saved."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_shadows = True; sh.shadow_intensity = 0.35
    sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.cavity_ridge_factor = 0.6; sh.cavity_valley_factor = 1.0
    sh.show_object_outline = False
    scene.display.render_aa = '16'
    world = bpy.data.worlds.new('w'); scene.world = world
    scene.render.film_transparent = False
    sh.background_type = 'VIEWPORT'; sh.background_color = (0.62, 0.62, 0.62)
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 88
    os.makedirs(EVID_DIR, exist_ok=True); os.makedirs(os.path.join(DOC_DIR, 'preview'), exist_ok=True)
    meshes = [o for o in objs if o.type == 'MESH']
    lo, hi = world_bounds(meshes)
    L, W, H = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
    views = [((1, 1), Matrix.Identity(4)), ((-1, 1), Matrix.Rotation(math.pi / 2, 4, 'Z')),
             ((1, -1), Matrix.Rotation(-math.pi / 2, 4, 'Z')), ((-1, -1), Matrix.Rotation(-math.pi / 2, 4, 'X'))]
    gx, gz = L * 0.62 + 0.3, max(H, W) * 0.62 + 0.25
    temp = []
    root.hide_render = True
    for o in meshes:
        o.hide_render = True
    for (sx, sz), rot in views:
        e = bpy.data.objects.new('view', None); scene.collection.objects.link(e)
        cz = -(lo[2] + hi[2]) / 2
        e.matrix_world = Matrix.Translation((sx * gx, 0, sz * gz)) @ rot @ Matrix.Translation((0, 0, cz))
        temp.append(e)
        for o in meshes:
            c = o.copy(); c.hide_render = False; scene.collection.objects.link(c)
            c.parent = e; c.matrix_parent_inverse = Matrix.Identity(4)
            c.matrix_basis = o.matrix_world.copy()
            temp.append(c)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 2 * gx + L + 0.6
    co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
    co.location = (0, 30, 0); co.rotation_euler = (math.radians(90), 0, math.radians(180))
    scene.camera = co
    scene.render.resolution_x, scene.render.resolution_y = 1800, int(1800 * (2 * gz + max(H, W) + 0.6) / cam.ortho_scale)
    out = os.path.join(DOC_DIR, 'preview', f'{asset_id}-ortho{tag}.jpg')
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    # 3/4 front close view and 3/4 rear view (perspective)
    for t in temp:
        if t.type == 'MESH':
            t.hide_render = True
    for o in meshes:
        o.hide_render = False
    cam.type = 'PERSP'; cam.lens = 50
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    for name, az, el, dist in (('front34', 35, 16, 1.0), ('rear34', 215, 20, 1.0), ('wheel', 70, 6, 0.45)):
        a, b = math.radians(az), math.radians(el)
        target = Vector((0, 0, H * 0.45)) if name != 'wheel' else Vector((L * 0.33, -W * 0.45, 0.35))
        R = max(L, 3.0) * 1.55 * dist
        co.location = target + Vector((math.cos(a) * math.cos(b), -math.sin(a) * math.cos(b), math.sin(b))) * R
        co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(EVID_DIR, f'{asset_id}-{name}{tag}.jpg')
        bpy.ops.render.render(write_still=True)
    return out
