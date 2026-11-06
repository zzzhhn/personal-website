"""Construction refinement of existing town Assets, before shared UV/PBR export.

Only visible bmeshes are changed. Collider bmeshes, anchors, named parts and
variant metadata belong to the base builders and must remain untouched.
"""
import os
import sys
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'town'))
from townlib import Face, box, cyl, gable, arc_wall, xform, Vector, Matrix, bmesh


def _components(bm):
    """Original primitives remain separate islands in the Asset accumulator."""
    seen = set()
    for seed in list(bm.verts):
        if seed in seen:
            continue
        verts, todo = [], [seed]
        seen.add(seed)
        while todo:
            v = todo.pop()
            verts.append(v)
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other not in seen:
                    seen.add(other)
                    todo.append(other)
        yield verts


def _remove_islands(A, predicate):
    bm, slots = A.parts[A.part]
    doomed = []
    for verts in _components(bm):
        lo = tuple(min(v.co[i] for v in verts) for i in range(3))
        hi = tuple(max(v.co[i] for v in verts) for i in range(3))
        faces = {f for v in verts for f in v.link_faces}
        mats = {slots[f.material_index] for f in faces}
        if predicate(lo, hi, mats):
            doomed.extend(verts)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='VERTS')


def _close(a, b, tol=0.001):
    return abs(a - b) < tol


def _rect(A, F, a, b, lo, hi, n0, n1, width, mat, bevel=0.0):
    """Four solid members around an OPEN rectangle, never a backing panel."""
    for u0, u1, z0, z1 in ((a, a + width, lo, hi),
                            (b - width, b, lo, hi),
                            (a + width, b - width, lo, lo + width),
                            (a + width, b - width, hi - width, hi)):
        A.box(*F.box(n0, n1, u0, u1, z0, z1), mat, bevel)


def _beam(A, p0, p1, width, depth, mat='town_metal', bevel=0.0):
    p0, p1 = Vector(p0), Vector(p1)
    direction = p1 - p0
    bm = box((-width / 2, -depth / 2, 0),
             (width / 2, depth / 2, direction.length), bevel)
    rotation = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    A.add(xform(bm, Matrix.Translation(p0) @ rotation.to_matrix().to_4x4()), mat)


def _pipe(A, p0, p1, radius=0.055, mat='town_metal', sides=10):
    p0, p1 = Vector(p0), Vector(p1)
    direction = p1 - p0
    rotation = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    bm = cyl((0, 0), radius, 0, direction.length, sides)
    A.add(xform(bm, Matrix.Translation(p0) @ rotation.to_matrix().to_4x4()), mat,
          smooth=True)


def _coping(A, x0, x1, y0, y1, z, thickness=0.25, mat='town_trim',
            overhang=0.03, height=0.08, pitch=1.65):
    """Replace the base builder's full roof lid with caps ON the parapet.

    Four strips meet without overlapping top faces; 8 mm joints are physical
    gaps between stones/folded sections, not coplanar dark decals.
    """
    _remove_islands(A, lambda lo, hi, mats:
                    mats == {mat} and _close(lo[0], x0 - overhang)
                    and _close(hi[0], x1 + overhang)
                    and _close(lo[1], y0 - overhang)
                    and _close(hi[1], y1 + overhang)
                    and _close(lo[2], z) and _close(hi[2], z + height))
    t = thickness + 2 * overhang
    for F, a, b in ((Face('x', -1, x0 - overhang), y0 - overhang, y1 + overhang),
                     (Face('x', 1, x1 + overhang), y0 - overhang, y1 + overhang),
                     (Face('y', -1, y0 - overhang), x0 - overhang + t, x1 + overhang - t),
                     (Face('y', 1, y1 + overhang), x0 - overhang + t, x1 + overhang - t)):
        n = max(1, math.ceil((b - a) / pitch))
        for i in range(n):
            u0, u1 = a + (b - a) * i / n, a + (b - a) * (i + 1) / n
            A.box(*F.box(-t, 0, u0 + 0.004, u1 - 0.004, z, z + height),
                  mat, 0.005)


def _curtain_caps(A, F, a, b, z0, z1, floors=3, glass_set=0.12,
                  fin_out=0.14):
    """Extruded pressure caps and seals, with joints at actual floor modules."""
    count = max(1, round(b - a))
    pitch, fh = (b - a) / count, (z1 - z0) / floors
    for f in range(floors):
        zb = z0 + f * fh
        # A seal seated on the glass edge, then the projecting aluminium cover.
        for zz in (zb + 0.55, zb + fh - 0.035):
            A.box(*F.box(-glass_set + 0.001, -glass_set + 0.019,
                         a + 0.05, b - 0.05, zz, zz + 0.028), 'town_dark')
        for c in range(count):
            u0, u1 = a + c * pitch, a + (c + 1) * pitch
            A.box(*F.box(-glass_set + 0.015, 0.055,
                         u0 + 0.06, u1 - 0.06, zb + 0.535, zb + 0.575),
                  'town_metal')
        for c in range(count + 1):
            u = a + c * pitch
            A.box(*F.box(fin_out - 0.01, fin_out + 0.025,
                         u - 0.032, u + 0.032, zb + 0.018, zb + fh - 0.018),
                  'town_metal')


def _T01(A):
    A.use('T01_body')
    # The old front dark triangular prism masked the entire recessed cream
    # tympanum. Rebuild the triangle as an inset core plus real raking members.
    _remove_islands(A, lambda lo, hi, mats:
                    ((mats == {'town_stone_dark'} and _close(lo[0], 2.6)
                      and _close(hi[0], 4.56) and _close(hi[2], 9.0))
                     or (mats == {'town_stone'} and _close(lo[0], 2.4)
                         and _close(hi[0], 4.44) and _close(hi[2], 8.78))))
    A.add(gable(2.4, 4.42, -4.0, 4.0, 8.0, 8.88), 'town_stone')
    for sign in (-1, 1):
        _beam(A, (4.50, sign * 3.99, 8.045), (4.50, 0, 8.94),
              0.16, 0.12, 'town_stone_dark', 0.008)
        _beam(A, (4.465, sign * 3.77, 8.04), (4.465, 0, 8.815),
              0.07, 0.045, 'town_trim', 0.004)
    A.box((4.41, -0.095, 8.88), (4.58, 0.095, 9.0), 'town_stone_dark', 0.008)
    A.box((4.43, -4.02, 8.045), (4.55, 4.02, 8.115), 'town_trim', 0.008)
    # Four load-bearing stone shafts gain a few quiet bed joints, not boltwork.
    for y in (-3.7, -1.25, 1.25, 3.7):
        for z in (2.18, 3.96):
            _rect(A, Face('x', 1, 4.15), y - 0.247, y + 0.247,
                  z, z + 0.032, -0.247, 0.247, 0.012, 'town_stone_dark')
        # Capital's bearing layer sits between shaft and existing cap stone.
        A.box((3.85, y - 0.30, 5.985), (4.45, y + 0.30, 6.025), 'town_trim', 0.005)
    # Recessed porch ceiling coffers: framing fixed to the slab, clear below.
    for y in (-3.68, -1.25, 1.25, 3.68):
        A.box((2.08, y - 0.045, 6.13), (4.14, y + 0.045, 6.205), 'town_stone_dark')
    A.box((2.35, -3.7, 6.13), (2.43, 3.7, 6.205), 'town_stone_dark')
    _coping(A, -4.5, 4.5, -4, 4, 7.9, overhang=0.0, height=0.1)


def _T02(A):
    A.use('T02_body')
    for F, a, b in ((Face('x', 1, 4.5), -4, 4),
                     (Face('x', -1, -4.5), -4, 4),
                     (Face('y', 1, 4), -4.5, 4.5),
                     (Face('y', -1, -4), -4.5, 4.5)):
        _curtain_caps(A, F, a, b, 3.85, 11.1)
    # Screen frame remains wholly outside the runtime active rectangle.
    front = Face('x', 1, 4.5)
    fh = (11.1 - 3.85) / 3
    _rect(A, front, -1.055, 2.055, 3.85 + fh + 0.095, 11.005,
          0.235, 0.27, 0.05, 'town_metal')
    for u in (-0.96, 1.96):
        A.box(*front.box(-0.04, 0.03, u - 0.045, u + 0.045, 6.1, 10.9),
              'town_metal')
    # Lobby mullions now have distinct sill/head frames and two hinge rails.
    lobby = Face('x', 1, 3.3)
    for z in (0.20, 3.19):
        A.box(*lobby.box(-0.045, 0.027, -2.78, 2.78, z, z + 0.045), 'town_metal')
    for u in (-0.95, 0.92):
        A.box(*lobby.box(0.058, 0.085, u, u + 0.03, 0.23, 2.42), 'town_metal')
    # Supporting capital rings explain the transfer from pilotis to slab.
    for y in (-3.65, 3.65):
        A.add(cyl((4.15, y), 0.355, 3.27, 3.4, 16), 'town_metal', smooth=True)
    _coping(A, -4.5, 4.5, -4, 4, 12.0)


def _T04(A):
    A.use('T04_body')
    # Tie rods carry the long notch canopy back to the upper concrete slab.
    for y in (-3.75, -1.05):
        _pipe(A, (4.88, y, 2.90), (3.72, y, 3.55), 0.033, sides=10)
        A.box((4.77, y - 0.09, 2.88), (4.98, y + 0.09, 2.925), 'town_metal', 0.005)
        A.box((3.63, y - 0.09, 3.48), (3.82, y + 0.09, 3.56), 'town_metal', 0.005)
    # Folded front edge and fascia returns are narrow real sections.
    A.box((5.025, -4.40, 2.755), (5.10, -0.8, 2.895), 'town_metal', 0.006)
    A.box((1.50, -4.40, 2.755), (5.025, -4.335, 2.895), 'town_metal', 0.006)
    # Slate volume retains its colour-block identity. Floor-sized perimeter
    # joints/flashings sit in blank spandrels, clear of all ribbon openings.
    fh = (9.4 - 3.55) / 3
    for f in range(3):
        z = 3.55 + f * fh + 0.16
        for F, a, b in ((Face('x', 1, 4.85), -4.35, -0.4),
                         (Face('y', -1, -4.35), 0.9, 4.85)):
            A.box(*F.box(-0.008, 0.018, a + 0.02, b - 0.02, z, z + 0.045),
                  'town_metal')
    # Recessed door glass framed with a black seal, no panel across the notch.
    _rect(A, Face('x', 1, 1.5), -2.972, -2.078, 0.18, 2.365,
          0.032, 0.048, 0.019, 'town_dark')
    _coping(A, -4.5, 0.9, -4, 4, 10.0)


def _T05(A):
    A.use('T05_body')
    front, shop = Face('x', 1, 4.0), Face('x', 1, 1.6)
    # Arcade: shallow beam beds articulate the ceiling/column load path.
    for y in (-3.7, -1.25, 1.25, 3.7):
        A.box((1.62, y - 0.07, 3.25), (3.72, y + 0.07, 3.405), 'town_trim', 0.008)
    # Balcony knees bear into the wall and the underside of each slab.
    fh = (10.3 - 3.7) / 3
    for f in range(3):
        z = 3.7 + f * fh + 0.12
        for y in (-3.35, 0.0, 3.35):
            # The first balcony is over an open arcade. Its knees bear into
            # the transfer slab, never into the empty arcade space below.
            bearing = max(z - 0.51, 3.48)
            _beam(A, (4.025, y, bearing), (4.66, y, z - 0.145),
                  0.07, 0.065, 'town_metal', 0.004)
            A.box((4.005, y - 0.09, max(z - 0.56, 3.42)),
                  (4.06, y + 0.09, max(z - 0.28, 3.66)),
                  'town_metal')
        # End posts and a continuous lower rail make welded assembly legible.
        for u in (-3.77, 3.77):
            A.box(*front.box(0.665, 0.735, u - 0.035, u + 0.035, z, z + 1.0),
                  'town_metal', 0.004)
    # Roller-shutter guide channels meet the existing overhead cassette.
    for a, b in ((-3.8, -0.9), (0.9, 3.8)):
        for u in (a, b):
            A.box(*shop.box(0.005, 0.085, u - 0.035, u + 0.035, 0.19, 2.84),
                  'town_metal')
        A.box(*shop.box(0.012, 0.045, a + 0.025, b - 0.025, 2.24, 2.29),
              'town_dark')
    # The roof tank gets tension hoops, a supported outlet and a connected
    # service run. The original tank, hut and runtime sign remain unchanged.
    for z in (11.91, 12.45):
        A.add(arc_wall((-2.1, 1.8), 0.85, 0.88, 0.035, 2 * math.pi - 0.035,
                       z, z + 0.065, 24), 'town_metal', smooth=True)
    for x in (-2.8, -1.4):
        _beam(A, (x, 1.04, 10.45), (x, 2.56, 11.45), 0.065, 0.065)
    _pipe(A, (-1.27, 1.8, 11.78), (-0.97, 1.8, 11.78), 0.055)
    _pipe(A, (-0.97, 1.8, 11.78), (-0.97, 3.77, 11.03), 0.055)
    _pipe(A, (-0.97, 3.77, 11.03), (-3.75, 4.08, 10.61), 0.055)
    for z in (1.1, 4.3, 7.5, 10.2):
        A.box((-3.85, 3.96, z), (-3.65, 4.16, z + 0.045), 'town_metal')
    _coping(A, -4, 4, -4, 4, 10.9)


def _T06(A):
    A.use('T06_body')
    for F, a, b in ((Face('x', 1, 5), -4, 4),
                     (Face('x', -1, -5), -4, 4),
                     (Face('y', 1, 4), -5, 5),
                     (Face('y', -1, -4), -5, 5)):
        _curtain_caps(A, F, a, b, 4.6, 14.2, glass_set=0.14, fin_out=0.22)
    # Glazed lobby has a clear transom and sealed perimeter around the doors.
    lobby = Face('x', 1, 3)
    _rect(A, lobby, -1.075, 1.075, 0.18, 2.65, 0.061, 0.082, 0.025, 'town_metal')
    A.box(*lobby.box(-0.10, 0.025, -3.8, 3.8, 4.09, 4.15), 'town_metal')
    # Large honed-stone lobby walls gain restrained stone bed joints below the
    # tower. These relief edges live outside, rather than coplanar fake plates.
    for F, a, b in ((Face('y', 1, 4), -5, 3),
                     (Face('y', -1, -4), -5, 3),
                     (Face('x', -1, -5), -4, 4)):
        for z in (1.43, 2.75):
            A.box(*F.box(-0.008, 0.016, a + 0.04, b - 0.04, z, z + 0.026),
                  'town_stone')
    # Existing glow ring keeps its dedicated part/material/anchor. Add only
    # saddles and cleats on its four existing supports in T06_body.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        x, y = 2.5 * math.cos(a), 2.5 * math.sin(a)
        A.box((x - 0.12, y - 0.12, 15.12), (x + 0.12, y + 0.12, 15.18),
              'town_metal', 0.006)
        _beam(A, (x * 0.93, y * 0.93, 15.52), (x * 1.07, y * 1.07, 15.52),
              0.10, 0.09, 'town_metal', 0.006)


def _T07(A):
    # Every variant remains authored around its local origin. Runtime owns
    # rotations and placement, including the three opposite-facing buildings.
    specs = ((8, 8, 6), (7, 8, 4), (9, 7, 4.5), (7, 7, 4),
             (6, 6, 3), (5, 5, 2.6), (6, 5, 3.4))
    for i, (w, d, h) in enumerate(specs):
        A.use(f'T07_{i}')
        x0, x1, y = -w / 2, w / 2, d / 2
        top = h - 0.45
        _coping(A, x0, x1, -y, y, h - 0.08, thickness=0.2, pitch=1.8)
        # Reinforce the original thin door hood, preserving its width and head
        # level. Four-piece timber/stone framing leaves the doorway intact.
        count = max(1, int(d / 2.2))
        pitch = d / count
        c = -y + (count // 2 + 0.5) * pitch
        front = Face('x', 1, x1)
        # Bear on the original stone door jambs, also on the short variants
        # whose door surround extends higher than their main facade wall.
        for u in (c - 0.50, c + 0.50):
            _beam(A, front.point(0.04, u, 2.40), front.point(0.43, u, 2.70),
                  0.055, 0.055, 'town_metal')
        A.box(*front.box(0.44, 0.50, c - 0.75, c + 0.75, 2.70, 2.78),
              'town_metal', 0.004)
        # Only a few purpose-sized door edges, no extra ground step.
        for z in (0.34, 2.12):
            A.box(*front.box(-0.087, -0.065, c - 0.34, c + 0.34, z, z + 0.045),
                  'town_dark')
        A.box(*front.box(-0.085, -0.045, c + 0.22, c + 0.26, 0.98, 1.24),
              'town_metal', 0.004)
        # Side-mounted rear corner run fits inside the ORIGINAL plinth's
        # 6 cm outer envelope. It cannot enlarge a T07 variant's outer bounds.
        # The last side opening starts far beyond this rear corner pier.
        px, py = x0 + 0.13, y + 0.015
        _pipe(A, (px, y - 0.24, top - 0.05), (px, py, top - 0.10), 0.045, sides=8)
        _pipe(A, (px, py, top - 0.10), (px, py, 0.15), 0.045, sides=8)
        for z in (0.75, max(1.35, top - 0.5)):
            A.box((px - 0.09, y - 0.012, z), (px + 0.09, py + 0.045, z + 0.04),
                  'town_metal')


def _T03(A):
    """MoE: cedar screen / timber shopfront / folded flat-roof edge."""
    A.use('T03_body')
    front, shop = Face('x', 1, 5.0), Face('x', 1, 3.2)

    # Replace the sixteen knife-edged screen battens, not the whole facade.
    _remove_islands(A, lambda lo, hi, mats:
                    mats == {'town_wood'} and _close(lo[0], 5.1)
                    and _close(hi[0], 5.18) and _close(lo[2], 3.35)
                    and _close(hi[2], 4.5))
    for k in range(16):
        u = 0.3 + k * 0.22
        A.box(*front.box(0.1, 0.18, u - 0.035, u + 0.035, 3.35, 4.5),
              'town_wood', 0.008)
    # Cleats connect existing cedar crossrails to the cream structural wall.
    for u in (0.32, 1.45, 2.6, 3.67):
        for z in (3.30, 4.47):
            A.box(*front.box(-0.012, 0.105, u - 0.035, u + 0.035, z, z + 0.055),
                  'town_metal', 0.004)

    # Black EPDM edges reveal the glass/frame junction. Pane surfaces remain
    # recessed; these narrow rings never cover a whole window.
    for k in range(8):
        a = -3.6 + k * 0.9
        _rect(A, front, a + 0.027, a + 0.873, 3.414, 4.438,
              -0.119, -0.103, 0.018, 'town_dark')
    A.box(*front.box(-0.07, 0.035, -3.62, 3.62, 4.442, 4.49),
          'town_metal', 0.006)
    A.box(*front.box(0.03, 0.072, -3.62, 3.62, 3.324, 3.343),
          'town_metal', 0.004)
    for a, b in ((-3.8, -1.0), (1.0, 3.8)):
        for k in range(3):
            u0, u1 = a + k * (b - a) / 3, a + (k + 1) * (b - a) / 3
            _rect(A, shop, u0 + 0.037, u1 - 0.037, 0.615, 2.188,
                  -0.059, -0.047, 0.017, 'town_dark')
        # Projecting stone drip sill has ends and thickness above the brick riser.
        A.box(*shop.box(-0.02, 0.10, a - 0.03, b + 0.03, 0.55, 0.585),
              'town_stone', 0.006)
    for a, b in ((-1.0, -0.04), (0.04, 1.0)):
        _rect(A, shop, a + 0.078, b - 0.078, 0.281, 2.071,
              -0.079, -0.065, 0.018, 'town_dark')
        A.box(*shop.box(-0.018, 0.004, a + 0.06, b - 0.06, 0.18, 0.30),
              'town_metal', 0.004)

    # A real folded-metal fascia replaces the thin solid cream top slab.
    # The original maximum roof extent, top and lower plate are preserved.
    _remove_islands(A, lambda lo, hi, mats:
                    mats == {'town_cream'} and _close(lo[0], -5.62)
                    and _close(hi[0], 5.62) and _close(lo[2], 4.93)
                    and _close(hi[2], 5.01))
    A.box((-5.58, -4.58, 4.93), (5.58, 4.58, 5.01), 'town_roof')
    for F, a, b in ((Face('x', 1, 5.62), -4.62, 4.62),
                     (Face('x', -1, -5.62), -4.62, 4.62),
                     (Face('y', 1, 4.62), -5.58, 5.58),
                     (Face('y', -1, -4.62), -5.58, 5.58)):
        count = 6 if F.axis == 'x' else 7
        for k in range(count):
            u0, u1 = a + (b - a) * k / count, a + (b - a) * (k + 1) / count
            A.box(*F.box(-0.04, 0, u0 + 0.004, u1 - 0.004, 4.93, 5.01),
                  'town_metal', 0.003)

    # Roof-edge collection channel and a deliberate rear downpipe. A U-channel
    # stays open above, its fall enters a hopper and then the offset pipe.
    A.box((-5.50, -4.44, 5.012), (-5.28, 4.44, 5.04), 'town_metal')
    for x in (-5.50, -5.30):
        A.box((x, -4.44, 5.04), (x + 0.02, 4.44, 5.12), 'town_metal')
    for y in (-4.44, 4.42):
        A.box((-5.50, y, 5.04), (-5.28, y + 0.02, 5.12), 'town_metal')
    # This rear run is outside all openings, alongside the last back-wall pier.
    _pipe(A, (-5.39, 3.78, 5.025), (-5.39, 3.78, 4.74), 0.065)
    _pipe(A, (-5.39, 3.78, 4.74), (-5.12, 3.78, 4.42), 0.065)
    _pipe(A, (-5.12, 3.78, 4.42), (-5.12, 3.78, 0.24), 0.065)
    for z in (0.68, 2.34, 4.10):
        A.box((-5.135, 3.67, z), (-4.99, 3.89, z + 0.045), 'town_metal', 0.004)

    # Steel posts meet the timber soffit via bearing plates; no new floor step.
    for y in (-1.3, 1.3):
        A.box((4.76, y - 0.12, 2.46), (4.995, y + 0.12, 2.50),
              'town_metal', 0.006)
    # The existing planter solid's upper rim becomes a properly readable lip.
    for y in (-2.3, 2.3):
        for mn, mx in (((3.34, y - 0.56, 0.58), (3.96, y - 0.49, 0.63)),
                       ((3.34, y + 0.49, 0.58), (3.96, y + 0.56, 0.63)),
                       ((3.34, y - 0.49, 0.58), (3.41, y + 0.49, 0.63)),
                       ((3.89, y - 0.49, 0.58), (3.96, y + 0.49, 0.63))):
            A.box(mn, mx, 'town_trim', 0.008)


def refine(A):
    """Refine a base building and return it with all placement contracts intact."""
    if getattr(A, '_architecture_craft_applied', False):
        return A
    before_parts = tuple(A.parts)
    before_part = A.part
    handlers = {'T01': _T01, 'T02': _T02, 'T03': _T03, 'T04': _T04,
                'T05': _T05, 'T06': _T06, 'T07': _T07}
    handler = handlers.get(A.id)
    if handler:
        handler(A)
    assert tuple(A.parts) == before_parts, 'Architecture refinement changed named parts'
    A.use(before_part)
    A._architecture_craft_applied = True
    return A
