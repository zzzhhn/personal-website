"""Coastal town craft pass; called after the original town BUILDERS[aid]().

Only visible parts are edited. Colliders, attachment anchors, variant names and
origins stay with the source asset. No scene, material, export or render work.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector
from townlib import box, cyl, lathe, orient_outward, xform


def _beam(A, p0, p1, width, depth=None, mat='town_wood', bevel=0.006):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    depth = width if depth is None else depth
    bm = box((-width / 2, -depth / 2, 0),
             (width / 2, depth / 2, d.length), bevel)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    A.add(xform(bm, Matrix.Translation(p0) @ q.to_matrix().to_4x4()), mat)


def _tube(A, points, radius, mat, sides=6, wind=None, cyclic=False):
    """A closed, parallel-frame tube. Used for cloth hems and curved rachises."""
    ps = [Vector(p) for p in points]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(ps):
        tangent = ((ps[(i + 1) % len(ps)] - ps[(i - 1) % len(ps)]) if cyclic else
                   (ps[min(i + 1, len(ps) - 1)] - ps[max(0, i - 1)])).normalized()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
        a = tangent.cross(ref).normalized()
        b = tangent.cross(a).normalized()
        r = radius(i / (len(ps) - 1)) if callable(radius) else radius
        rings.append([bm.verts.new(p + r * (math.cos(k * math.tau / sides) * a +
                                                   math.sin(k * math.tau / sides) * b))
                      for k in range(sides)])
    for lo, hi in zip(rings, rings[1:] + rings[:1] if cyclic else rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((lo[k], lo[j], hi[j], hi[k]))
    if not cyclic:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    A.add(bm, mat, smooth=True, wind=wind)


def _remove_shells(A, predicate):
    """Remove whole disconnected source primitives, never a partial surface."""
    bm, slots = A.parts[A.part]
    seen, remove = set(), []
    for v0 in list(bm.verts):
        if v0 in seen:
            continue
        shell, stack = [], [v0]
        seen.add(v0)
        while stack:
            v = stack.pop()
            shell.append(v)
            for e in v.link_edges:
                other = e.other_vert(v)
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        lo = [min(v.co[k] for v in shell) for k in range(3)]
        hi = [max(v.co[k] for v in shell) for k in range(3)]
        mats = {slots[f.material_index] for v in shell for f in v.link_faces}
        if predicate(lo, hi, mats):
            remove.extend(shell)
    if remove:
        bmesh.ops.delete(bm, geom=remove, context='VERTS')


def _plaque(A):
    A.use('T09_body')
    tilt = (Matrix.Translation((0.06, 0, 1.25)) @
            Matrix.Rotation(math.radians(-10), 4, 'Y') @
            Matrix.Translation((-0.06, 0, -1.25)))
    # Rear fixing rails bear against the board; socket collars sit on the posts.
    for z in (0.94, 1.57):
        A.add(xform(box((-0.075, -0.72, z - 0.025),
                        (0.012, 0.72, z + 0.025), 0.008), tilt), 'town_metal')
    for y in (-0.62, 0.62):
        for z in (0.35, 1.54):
            A.add(cyl((0, y), 0.057, z, z + 0.075, 10), 'town_metal', smooth=True)
        # Four visible frame fasteners remain outside the runtime canvas area.
        for z in (0.72, 1.78):
            bm = lathe([(0.022, 0), (0.022, 0.013), (0.016, 0.020)], 8)
            xf = (tilt @ Matrix.Translation((0.158, y, z)) @
                  Matrix.Rotation(math.pi / 2, 4, 'Y'))
            A.add(xform(bm, xf), 'town_metal')
    # Folded drip edge projects from the existing cap, never over the canvas.
    A.add(xform(box((0.190, -0.82, 1.800), (0.225, 0.82, 1.845), 0.008), tilt), 'town_metal')


def _cloth_panel(A, y0, y1, mat):
    # Curved cross-section with shallow transverse sag, not a tilted flat slab.
    bm = bmesh.new()
    grids = []
    for dz in (0, 0.016):
        grid = []
        for i in range(5):
            t = i / 4
            x = 1.45 + 0.70 * t
            z = 2.34 - 0.42 * t - 0.055 * math.sin(math.pi * t) + dz
            grid.append([bm.verts.new((x, y0 + (y1 - y0) * j / 2,
                                      z - (0.012 if j == 1 else 0))) for j in range(3)])
        grids.append(grid)
    for g, reverse in zip(grids, (True, False)):
        for i in range(4):
            for j in range(2):
                vs = (g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1])
                bm.faces.new(vs[::-1] if reverse else vs)
    for i in range(4):
        for j in (0, 2):
            bm.faces.new((grids[0][i][j], grids[0][i + 1][j],
                          grids[1][i + 1][j], grids[1][i][j]))
    for i in (0, 4):
        for j in range(2):
            bm.faces.new((grids[0][i][j], grids[0][i][j + 1],
                          grids[1][i][j + 1], grids[1][i][j]))
    A.add(bm, mat)
    # Sewn front valance with a shallow scallop and round bottom hem.
    bm = bmesh.new()
    rows = []
    hem = []
    for i in range(5):
        t = i / 4
        y = y0 + (y1 - y0) * t
        bottom = 1.79 - 0.045 * math.sin(math.pi * t)
        rows.append([bm.verts.new((x, y, z))
                     for x, z in ((2.141, bottom), (2.141, 1.935),
                                  (2.159, 1.935), (2.159, bottom))])
        hem.append((2.155, y, bottom + 0.003))
    for a, b in zip(rows, rows[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], b[i], b[j], a[j]))
    bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    A.add(bm, mat)
    _tube(A, hem, 0.013, mat)


def _kiosks(A):
    for tag, canvas in (('a', 'town_canvas'), ('b', 'town_canvas_blue')):
        A.use('T10_' + tag)
        _remove_shells(A, lambda lo, hi, mats:
                       (lo[0] > 1.4 and lo[2] > 1.7 and hi[2] < 2.4) or
                       (lo[0] > 2.0 and 'town_metal' in mats) or
                       (abs(lo[2] - 1.13) < 1e-4 and abs(hi[2] - 1.2) < 1e-4))
        for k in range(6):
            y0 = -1.4 + k * 2.8 / 6
            _cloth_panel(A, y0, y0 + 2.8 / 6,
                         canvas if k % 2 == 0 else 'town_canvas_cream')
        # Canopy frame is attached to the corner posts, with no floating poles.
        _beam(A, (1.43, -1.4, 2.325), (1.43, 1.4, 2.325), 0.045, mat='town_metal')
        _beam(A, (2.12, -1.4, 1.905), (2.12, 1.4, 1.905), 0.035, mat='town_metal')
        for y in (-1.28, 1.28):
            _beam(A, (1.22, y, 1.58), (2.12, y, 1.905), 0.038, mat='town_metal')
            _beam(A, (1.22, y, 2.30), (1.46, y, 2.325), 0.045, mat='town_metal')
            A.box((1.285, y - 0.055, 1.53), (1.315, y + 0.055, 1.72), 'town_metal', 0.005)
        # Three long counter boards have real seams and exposed eased end grain.
        for i in range(3):
            x0 = 0.8 + i * 0.65 / 3
            A.box((x0 + (0.003 if i else 0), -1.2, 1.13),
                  (x0 + 0.65 / 3 - (0.003 if i < 2 else 0), 1.2, 1.2), 'town_wood', 0.010)
        for y in (-0.88, 0.88):
            _beam(A, (1.18, y, 0.91), (1.42, y, 1.13), 0.055)
        A.box((1.15, -1.22, 2.24), (1.29, 1.22, 2.35), 'town_wood', 0.010)
        for y in (-1.22, 1.22):
            _beam(A, (1.19, y, 1.91), (0.82, y, 2.29), 0.065)
        # Feet and post capitals explain the frame and cladding terminations.
        for x in (-1.22, 1.22):
            for y in (-1.22, 1.22):
                A.box((x - 0.085, y - 0.085, 0.25),
                      (x + 0.085, y + 0.085, 0.35), 'town_metal', 0.008)
                A.box((x - 0.09, y - 0.09, 2.27),
                      (x + 0.09, y + 0.09, 2.35), 'town_wood', 0.010)


def _rescue_ring(A, center):
    bm = bmesh.new()
    c = Vector(center)
    rings = []
    # Four cream sectors interrupt an orange closed torus, no overlay patches.
    for i in range(24):
        a = math.tau * i / 24
        radial = Vector((0, math.cos(a), math.sin(a)))
        rings.append([bm.verts.new(c + radial * (0.255 + 0.044 * math.cos(k * math.tau / 8)) +
                                  Vector((0.044 * math.sin(k * math.tau / 8), 0, 0))) for k in range(8)])
    # One manifold torus with face materials keeps the sector shading continuous.
    for i in range(24):
        for k in range(8):
            face = bm.faces.new((rings[i][k], rings[(i + 1) % 24][k],
                                 rings[(i + 1) % 24][(k + 1) % 8], rings[i][(k + 1) % 8]))
            face.material_index = int(i % 6 < 2)
    orient_outward(bm)
    target, slots = A.parts[A.part]
    materials = ['town_canvas', 'town_trim']
    for mat in materials:
        if mat not in slots:
            slots.append(mat)
    vm = {v: target.verts.new(v.co) for v in bm.verts}
    for face in bm.faces:
        nf = target.faces.new([vm[v] for v in face.verts])
        nf.material_index = slots.index(materials[face.material_index])
        nf.smooth = True
    bm.free()
    # Carrier rope follows the rim, held by four short ties.
    ps = [c + Vector((0.015, 0.323 * math.cos(i * math.tau / 24),
                      0.323 * math.sin(i * math.tau / 24))) for i in range(24)]
    _tube(A, ps, 0.009, 'town_canvas_cream', sides=5, cyclic=True)
    for i in range(4):
        a = i * math.pi / 2
        radial = Vector((0, math.cos(a), math.sin(a)))
        _tube(A, [c + radial * 0.28 + Vector((0.022, 0, 0)),
                  c + radial * 0.326 + Vector((0.015, 0, 0))], 0.011, 'town_canvas_cream', sides=5)


def _tower(A):
    A.use('T11_body')
    _remove_shells(A, lambda lo, hi, mats:
                   'town_wood' in mats and abs(lo[2] - 3.0) < 1e-4 and abs(hi[2] - 3.12) < 1e-4 or
                   'town_wood' in mats and abs(lo[2] - 3.12) < 1e-4 and abs(hi[2] - 3.124) < 1e-4)
    for i in range(9):
        x0 = -1.3 + i * 2.6 / 9
        A.box((x0 + (0.004 if i else 0), -1.3, 3.0),
              (x0 + 2.6 / 9 - (0.004 if i < 8 else 0), 1.3, 3.124), 'town_wood', 0.008)
    for x in (-1.05, 0, 1.05):
        A.box((x - 0.055, -1.29, 2.83), (x + 0.055, 1.29, 3.0), 'town_wood', 0.008)
    for y in (-1.05, 1.05):
        A.box((-1.2, y - 0.06, 2.73), (1.2, y + 0.06, 2.90), 'town_wood', 0.008)
    # Metal saddles and through bolts only where braces meet the piles.
    for x in (-1.05, 1.05):
        for y in (-1.05, 1.05):
            A.add(cyl((x, y), 0.097, 2.68, 2.78, 10), 'town_metal', smooth=True)
            for z in (1.2, 2.8):
                bm = lathe([(0.026, 0), (0.026, 0.022)], 8)
                xf = Matrix.Translation((x + (0.085 if x > 0 else -0.085), y, z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
                A.add(xform(bm, xf), 'town_metal')
    # Hut corner posts and underside roof rafters meet the existing fascia.
    for x in (-0.98, 0.58):
        for y in (-0.94, 0.94):
            A.box((x - 0.035, y - 0.035, 3.124), (x + 0.035, y + 0.035, 4.87), 'town_trim', 0.008)
    for x in (-1.3, 0.9):
        for y in (-1.25, 1.25):
            _beam(A, (x, y, 4.84), (-0.2, 0, 5.50), 0.06)
    # Ring hangs over the front railing; no extra stairs or collision expansion.
    _rescue_ring(A, (1.34, 0.55, 3.61))
    _tube(A, [(1.25, 0.55, 3.99), (1.35, 0.55, 4.02), (1.36, 0.55, 3.89)], 0.018, 'town_metal')


def _palm_leaves(A, tag, height, lean, lean_dir, count, seed, origin):
    rnd = random.Random(seed)
    # Match the source's coconut RNG draws before generating its frond envelope.
    for _ in range(5):
        rnd.random()
    d = Vector((math.cos(lean_dir), math.sin(lean_dir), 0))
    top = Vector(origin) + d * lean + Vector((0, 0, height))
    part = 'T12_' + tag + '_leaves'
    old, slots = A.parts[part]
    old.free()
    A.parts[part] = [bmesh.new(), slots]
    A.winds[part] = {}
    A.use(part)
    for f in range(count):
        az = f * math.tau / count + rnd.uniform(-0.15, 0.15)
        length = rnd.uniform(2.3, 2.9)
        rise = rnd.uniform(0.35, 0.75) if f % 3 else rnd.uniform(0.1, 0.3)
        droop = rnd.uniform(1.3, 1.9)
        forward = Vector((math.cos(az), math.sin(az), 0))
        side = Vector((-math.sin(az), math.cos(az), 0))
        def rachis(t):
            return top + Vector((0, 0, 0.45)) + forward * (length * t) + Vector((0, 0, rise * t * 2.2 - droop * t * t))
        group = (f % 8 + 0.5) / 8
        def wind(co, base=top, ln=length, g=group):
            r = min(1.0, (co - base).length / ln)
            return (1.0, r, r * r, g)
        mat = 'palm_leaf' if f % 2 else 'palm_leaf_dark'
        _tube(A, [rachis(i / 9) for i in range(10)], lambda t: 0.025 * (1 - t) + 0.005,
              mat, sides=4, wind=wind)
        bm = bmesh.new()
        for i in range(1, 9):
            t = i / 9
            c = rachis(t)
            tangent = (rachis(min(1, t + 0.05)) - rachis(max(0, t - 0.05))).normalized()
            span = 0.62 * math.sin(math.pi * min(1, t * 1.05)) + 0.1
            for sign in (-1, 1):
                rows = []
                # Four stations make each original leaflet a swept, folded blade.
                for j, u in enumerate((0, 0.32, 0.70, 1)):
                    center = (c + side * (sign * span * u) + tangent * (0.18 * u + 0.035 * math.sin(math.pi * u)) -
                              Vector((0, 0, (0.16 + 0.25 * t) * u * u)))
                    width = (0.025, 0.070, 0.045, 0.003)[j] * (0.85 + 0.15 * math.sin(t * math.pi))
                    fold = 0.030 * math.sin(math.pi * u)
                    rows.append([bm.verts.new(center - tangent * width),
                                 bm.verts.new(center + Vector((0, 0, fold))),
                                 bm.verts.new(center + tangent * width)])
                for a, b in zip(rows, rows[1:]):
                    bm.faces.new((a[0], b[0], b[1], a[1]))
                    bm.faces.new((a[1], b[1], b[2], a[2]))
        A.add(bm, mat, closed=False, wind=wind)


def _palms(A):
    for tag, h, lean, direction, count, seed, origin in (
            ('a', 6.4, 0.7, 0.4, 11, 7, (0, 0, 0)),
            ('b', 5.3, 1.0, 2.6, 10, 19, (0, -4.0, 0))):
        # Existing trunk rings retain all wind values, with restrained bark relief.
        A.use('T12_' + tag + '_trunk')
        bm, _ = A.parts[A.part]
        d = Vector((math.cos(direction), math.sin(direction), 0))
        o = Vector(origin)
        for v in bm.verts:
            t = max(0, min(1, v.co.z / h))
            if t > 0.98 or t < 0.02:
                continue
            axis = o + d * (lean * t * t) + Vector((0, 0, h * t))
            radial = Vector((v.co.x - axis.x, v.co.y - axis.y, 0))
            if radial.length < 0.08:
                continue
            a = math.atan2(radial.y, radial.x)
            v.co += radial.normalized() * (0.006 * math.sin(a * 3 + t * 21) + 0.003 * math.sin(a * 7 - t * 15))
        # Angled leaf-base scars interrupt the even stacked ring rhythm. Each
        # closed wedge meets the trunk and bends with its own original height.
        for i in range(2, int(h / 0.32) - 1, 2):
            t = i / int(h / 0.32)
            center = o + d * (lean * t * t) + Vector((0, 0, h * t))
            r = 0.2 - 0.07 * t
            a = i * 2.399 + seed
            radial = Vector((math.cos(a), math.sin(a), 0))
            tangent = Vector((-math.sin(a), math.cos(a), 0))
            scar = bmesh.new()
            pts = [center + radial * rr + tangent * u + Vector((0, 0, z))
                   for rr, u, z in ((r - 0.030, -0.085, 0), (r - 0.030, 0.085, 0),
                                    (r + 0.018, 0.070, 0.038), (r + 0.018, -0.060, 0.057),
                                    (r - 0.030, -0.070, 0.095), (r - 0.030, 0.070, 0.095))]
            vs = [scar.verts.new(p) for p in pts]
            for face in ((0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)):
                scar.faces.new([vs[k] for k in face])
            A.add(scar, 'palm_trunk', wind=lambda co, hh=h: (min(1.0, (co.z / hh) ** 2), 0, 0, 0))
        _palm_leaves(A, tag, h, lean, direction, count, seed, origin)


def refine(A):
    """Refine one pre-built Asset in place and return it with contracts intact."""
    handler = {'T09': _plaque, 'T10': _kiosks, 'T11': _tower, 'T12': _palms}.get(A.id)
    if handler:
        handler(A)
    return A
