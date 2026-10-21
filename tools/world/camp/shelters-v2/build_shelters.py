"""Camp L1 shelters group: C03 big tent, C04 small tent, C05 fire pit, C06 log bench.

Run: Blender -b --factory-startup -P build_shelters.py -- [C03 C04 C05 C06]
Blender is Z-up, front is +X. The glTF exporter converts to +Y up exactly once, so
GLB dims are (x, y, z) = (Blender X, Blender Z, -Blender Y). Ground contact z=0 and the
horizontal bounds centre is the origin. Only the asset root and its mesh are exported.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

REPO = '/Users/bobby/WorkBuddy/personal-website/personal-website'
TOOLS = f'{REPO}/tools/world/camp/shelters-v2'
GLB_DIR = f'{REPO}/public/assets/world/camp'
DOCS = f'{REPO}/docs/world/quality-v2/shelters'

# key: (material name, sRGB hex, materialRole, roughness). 'binding' is a darker shade of the
# locked canvas orange (derived; documented in README). Others are contract palette values.
PALETTE = {
    'canvas': ('camp_canvas_orange', '#E8803A', 'canvas', 0.88),
    'binding': ('camp_canvas_binding', '#B9602A', 'canvas', 0.9),
    'cream': ('camp_canvas_cream', '#E6DCCB', 'canvas', 0.9),
    'groundsheet': ('camp_groundsheet', '#5A4634', 'canvas', 0.95),
    'wood_light': ('camp_wood_light', '#B99469', 'wood', 0.85),
    'bark': ('camp_wood_bark', '#5A4634', 'wood', 0.92),
    'stone_light': ('camp_stone_light', '#B4A896', 'stone', 0.92),
    'stone_dark': ('camp_stone_dark', '#8C8276', 'stone', 0.95),
    # r2: was slate blue #4E647D, read as a water pool in neutral light; now a derived charcoal
    # (darkened stone #8C8276), documented in README.
    'ash': ('camp_ash_charcoal', '#5B5650', 'stone', 0.97),
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def get_material(key):
    name, hx, role, rough = PALETTE[key]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_linear(hx)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    mat.diffuse_color = hex_linear(hx)
    mat['materialRole'] = role
    mat['srgbHex'] = hx
    return mat


class Builder:
    """Closed shells into one bmesh with per-face material keys; ledger records parts."""

    def __init__(self):
        self.bm = bmesh.new()
        self.keys = []
        self.ledger = []

    def mi(self, key):
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def v(self, p):
        return self.bm.verts.new(Vector(p))

    def face(self, verts, key):
        f = self.bm.faces.new(verts)
        f.material_index = self.mi(key)
        return f

    def note(self, part, key, relation, count=1):
        self.ledger.append(dict(part=part, material=PALETTE[key][0], relation=relation, count=count))

    def prism(self, pts, offset, key, cap_key=None):
        """Planar polygon (may be concave) extruded by offset into a closed shell."""
        offset = Vector(offset)
        a = [self.v(p) for p in pts]
        b = [self.v(Vector(p) + offset) for p in pts]
        self.face(list(reversed(a)), cap_key or key)
        self.face(b, cap_key or key)
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            self.face([a[i], a[j], b[j], b[i]], key)

    def loft(self, rings, side_key, cap_key=None, inset=None, ring_key=None):
        """Closed loft through matching rings. side_key may be callable(station, i).
        inset splits each planar end cap into an outer ring and a lighter cut face."""
        vs = [[self.v(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for s in range(len(vs) - 1):
            for i in range(n):
                j = (i + 1) % n
                k = side_key(s, i) if callable(side_key) else side_key
                self.face([vs[s][i], vs[s][j], vs[s + 1][j], vs[s + 1][i]], k)
        fallback = side_key if not callable(side_key) else 'bark'
        for idx, ring in ((0, vs[0]), (1, vs[-1])):
            ordered = list(reversed(ring)) if idx == 0 else ring
            if inset:
                c = sum((v.co for v in ring), Vector()) / n
                inner = [self.v(c + (v.co - c) * inset) for v in ordered]
                for i in range(n):
                    j = (i + 1) % n
                    self.face([ordered[i], ordered[j], inner[j], inner[i]], ring_key or fallback)
                self.face(inner, cap_key or fallback)
            else:
                self.face(ordered, cap_key or fallback)

    def tube(self, a, b, r, sides, key, cap_key=None, r2=None, phase=None, inset=None, ring_key=None):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
        u = d.cross(up).normalized()
        w = d.cross(u).normalized()
        ph = math.pi / sides if phase is None else phase
        rings = []
        for c, rr in ((a, r), (b, r if r2 is None else r2)):
            rings.append([c + rr * (math.cos(ph + 2 * math.pi * i / sides) * u +
                                    math.sin(ph + 2 * math.pi * i / sides) * w) for i in range(sides)])
        self.loft(rings, key, cap_key or key, inset=inset, ring_key=ring_key)

    def bar(self, a, b, half, key):
        """Square-section strip (binding / rope) between two points."""
        self.tube(a, b, half * math.sqrt(2), 4, key, phase=math.pi / 4)

    def finish(self, name):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for key in self.keys:
            me.materials.append(get_material(key))
        for p in me.polygons:
            p.use_smooth = False
        return me


# ---------------------------------------------------------------- tents (C03/C04)
TENTS = {
    # body length L along X, wall half-width W, side wall height hw, ridge hr, door half-width dw /
    # height dh, footprint half extents Xh/Yh (stakes inside), finial top H, roof overhangs, thickness t.
    'C03': dict(L=3.0, W=1.6, hw=0.6, hr=3.0, dw=0.70, dh=2.25, jamb=1.70, topw=0.32, Xh=2.1, Yh=2.75, H=3.3,
                ovx=0.16, ovs=0.13, t=0.07, win=(0.36, 1.32, 1.74)),
    'C04': dict(L=2.4, W=1.28, hw=0.68, hr=2.35, dw=0.63, dh=1.90, jamb=1.36, topw=0.30, Xh=1.7, Yh=2.2, H=2.5,
                ovx=0.13, ovs=0.11, t=0.065, win=(0.28, 1.0, 1.32)),
}


def rotate_about(p, a, axis, ang):
    return a + Matrix.Rotation(ang, 3, axis.normalized()) @ (p - a)


def build_tent(B, P):
    L, W, hw, hr = P['L'], P['W'], P['hw'], P['hr']
    t, ovx, ovs, sag, tw, emb = P['t'], P['ovx'], P['ovs'], 0.05, 0.05, 0.03
    s = (hr - hw) / W
    zin = lambda y: hr - s * abs(y)
    Ye = W + ovs
    X0, X1 = -(L / 2 + ovx), L / 2 + ovx
    prof = [(Ye, zin(Ye)), (W / 2, zin(W / 2) - sag), (0, hr), (-W / 2, zin(W / 2) - sag), (-Ye, zin(Ye))]

    # Roof fly: one closed chevron section (sagging slopes, real thickness) lofted along X.
    section = [(y, z + t) for y, z in prof] + [(y, z) for y, z in reversed(prof)]
    B.loft([[Vector((x, y, z)) for y, z in section] for x in (X0, X1)], 'canvas')
    B.note('roof fly, chevron section with sag, thickness %.3f m' % t, 'canvas', 'canvas shell')

    # Gable walls, top edge buried emb into the roof underside; front has the door notch.
    top = [(W, zin(W) + emb), (W / 2, zin(W / 2) - sag + emb), (0, hr + emb),
           (-W / 2, zin(W / 2) - sag + emb), (-W, zin(W) + emb)]
    dw, dh = P['dw'], P['dh']
    door = [(-dw, 0), (-dw, P['jamb']), (-P['topw'], dh), (P['topw'], dh), (dw, P['jamb']), (dw, 0)]
    front = [(-W, 0)] + door + [(W, 0)] + top
    back = [(-W, 0), (W, 0)] + top
    B.prism([Vector((L / 2 - tw, y, z)) for y, z in front], (tw, 0, 0), 'canvas')
    B.prism([Vector((-L / 2, y, z)) for y, z in back], (tw, 0, 0), 'canvas')
    for sy in (1, -1):
        y0 = sy * W - (tw if sy > 0 else 0)
        B.prism([Vector((x, y0, z)) for x, z in ((-L / 2, 0), (L / 2, 0), (L / 2, hw + emb), (-L / 2, hw + emb))],
                (0, tw, 0), 'canvas')
    B.note('gable walls (front door notch) and short side walls, tops buried in roof', 'canvas', 'embedded', 4)

    # Binding wraps every roof edge (eaves and both gable edges).
    hb = t * 0.68
    for sy in (1, -1):
        B.bar((X0 - 0.01, sy * Ye, zin(Ye) + t / 2), (X1 + 0.01, sy * Ye, zin(Ye) + t / 2), hb, 'binding')
    for x in (X0, X1):
        for (y0, z0), (y1, z1) in zip(prof[:-1], prof[1:]):
            d = Vector((0, y1 - y0, z1 - z0)).normalized() * 0.02
            B.bar(Vector((x, y0, z0 + t / 2)) - d, Vector((x, y1, z1 + t / 2)) + d, hb, 'binding')
    B.note('roof edge binding strips wrapping canvas edge', 'binding', 'embedded on edge', 10)

    # r3: ridge cap and sewn panel seams break the flat roof slab seen from the side.
    B.bar((X0 + 0.02, 0, hr + t), (X1 - 0.02, 0, hr + t), 0.035, 'binding')
    seams = 0
    for xs in (-L / 6, L / 6):
        for (y0, z0), (y1, z1) in zip(prof[:-1], prof[1:]):
            d = Vector((0, y1 - y0, z1 - z0)).normalized() * 0.012
            B.bar(Vector((xs, y0, z0 + t)) - d, Vector((xs, y1, z1 + t)) + d, 0.018, 'binding')
            seams += 1
    B.note('ridge cap strip', 'binding', 'half-buried in roof top')
    B.note('sewn roof panel seams following the sagging slope', 'binding', 'half-buried in roof top', seams)

    # Two rolled/tied side curtains: a real open doorway, not an invisible rectangular cutout.
    # The panel shape follows the same shoulder-height opening used by collision geometry.
    xf = L / 2 + 0.018
    for sy in (1, -1):
        # Gathered cloth is attached outside the clear opening, with a waist tie at mid-height.
        yc = sy * (dw + 0.10)
        rings = []
        for z, radius in ((0.08, 0.075), (P['jamb'] * 0.50, 0.045), (P['jamb'], 0.075)):
            rings.append([Vector((xf + radius * math.cos(a), yc + radius * math.sin(a), z))
                          for a in [i * math.tau / 8 for i in range(8)]])
        B.loft(rings, 'canvas')
        # The cuff wraps the cloth rather than hanging as a detached cord.
        B.tube((xf, yc, P['jamb'] * 0.5 - 0.025), (xf, yc, P['jamb'] * 0.5 + 0.025), 0.055, 8, 'cream')
    opening = [Vector((xf, y, z + (0.04 if z == 0 else 0))) for y, z in door]
    for a, b in zip(opening[:-1], opening[1:]):
        B.bar(a, b, 0.025, 'binding')
    B.note('six-sided upright doorway with bound edges, two gathered side curtains', 'canvas', 'embedded beside doorway; clear centre', 2)
    B.note('curtain cuffs', 'cream', 'embedded around gathered cloth', 2)

    # Back vent window patch, slightly proud of the back wall.
    wh, z0, z1 = P['win']
    B.prism([Vector((-L / 2 - 0.018, y, z)) for y, z in ((-wh, z0), (wh, z0), (wh, z1), (-wh, z1))],
            (0.028, 0, 0), 'cream')
    B.note('rear vent window patch', 'cream', 'embedded in back wall')

    # Groundsheet inside, with a doormat lip under the open door.
    B.prism([Vector((x, y, 0)) for x, y in ((-L / 2 + 0.02, -W + 0.02), (L / 2 + 0.1, -W + 0.02),
                                              (L / 2 + 0.1, W - 0.02), (-L / 2 + 0.02, W - 0.02))],
            (0, 0, 0.025), 'groundsheet')
    B.note('groundsheet / doormat', 'groundsheet', 'resting on ground, under walls')

    # Ridge has a rear post; the entrance has two side posts with roof braces.
    # No floor-to-ridge post through the clear entrance lane.
    B.tube((X0 - 0.07, 0, hr - 0.04), (X1 + 0.07, 0, hr - 0.04), 0.05, 8, 'wood_light')
    rear = -L / 2 + 0.12
    frontx = L / 2 - 0.12
    B.tube((rear, 0, 0.055), (rear, 0, hr + t * 0.5), 0.055, 8, 'wood_light')
    for sy in (-1, 1):
        y = sy * (dw + 0.14)
        shoulder = zin(y) - 0.13
        B.tube((frontx, y, 0.055), (frontx, y, shoulder), 0.05, 8, 'wood_light')
        B.tube((frontx, y, shoulder - 0.035), (frontx, 0, hr - 0.04), 0.045, 8, 'wood_light')
    for px in (rear, frontx):
        B.tube((px, 0, hr - 0.10), (px, 0, P['H']), 0.03, 8, 'wood_light', r2=0.008)
    B.note('ridge, rear post, doorway side posts and roof braces', 'wood_light', 'structural embedded joints; no central entrance post', 6)

    # Guy lines from eave corners and mid-eaves to leaning stakes inside the footprint.
    sh, sr, cap = 0.3, 0.035, 0.055
    # r2: four corner stakes only (six read as a fence from the front); kept 0.13 m inside footprint
    stakes = [(sx * (P['Xh'] - 0.13), sy * (P['Yh'] - 0.13)) for sx in (1, -1) for sy in (1, -1)]
    for x, y in stakes:
        out = Vector((x, y, 0)).normalized() * 0.05
        base, tip = Vector((x, y, 0.008)), Vector((x, y, sh)) + out
        base.z += sr * math.sin(math.atan2(0.05, sh))  # tilted foot circle stays at/above z=0
        axis = (tip - base).normalized()
        B.tube(base, tip, sr, 6, 'wood_light', r2=sr * 0.9)
        B.tube(tip - axis * 0.05, tip + axis * 0.015, cap, 6, 'wood_light')
        attach = Vector((math.copysign(min(abs(x), L / 2 + ovx - 0.05), x) if x else 0,
                         math.copysign(Ye - 0.02, y), zin(Ye) + 0.02))
        knot = base + (tip - base) * 0.78
        B.bar(attach, knot, 0.016, 'cream')
    B.note('stakes with caps, leaning outward', 'wood_light', 'resting on ground plane', len(stakes))
    B.note('guy lines eave->stake, ends buried in binding and stake', 'cream', 'embedded ends', len(stakes))


# ---------------------------------------------------------------- C05 fire pit
def build_firepit(B):
    n, ri, ro, gap = 12, 1.12, 1.6, math.radians(1.6)
    jitter = [0.02, -0.03, 0.01, 0.035, -0.015, 0.0, 0.03, -0.025, 0.015, -0.01, 0.025, -0.02]
    for k in range(n):
        a0 = 2 * math.pi * k / n + gap
        a1 = 2 * math.pi * (k + 1) / n - gap
        h = 0.38 + jitter[k]
        c = 0.075
        prof = [(ri, 0), (ro, 0), (ro, h - c), (ro - c * 1.2, h), (ri + c, h), (ri, h - c * 0.8)]
        rings = [[Vector((r * math.cos(a), r * math.sin(a), z)) for r, z in prof] for a in (a0, a1)]
        B.loft(rings, 'stone_dark' if k % 3 == 1 else 'stone_light')
    B.note('stone ring blocks with chamfered tops, small gaps', 'stone_light', 'separate stones resting on ground', n)

    m = 12
    bed = [Vector(((ri + 0.06) * math.cos(2 * math.pi * i / m + math.pi / m),
                   (ri + 0.06) * math.sin(2 * math.pi * i / m + math.pi / m), 0)) for i in range(m)]
    B.prism(bed, (0, 0, 0.05), 'ash')
    B.note('ash bed disc', 'ash', 'resting on ground, edge under stones')

    # five radial logs leaning in, leaving an open centre (r<0.2) for the runtime flame
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        d = Vector((math.cos(a), math.sin(a), 0))
        r = 0.085
        # r2: teepee (reference) instead of flat spokes; tips stop at r=0.15 leaving the flame core open
        outer = d * 0.74 + Vector((0, 0, 0.05 + r))
        inner = d * 0.15 + Vector((0, 0, 0.5))
        B.tube(outer, inner, r, 7, 'bark', cap_key='wood_light', inset=0.72, ring_key='bark')
    B.note('radial firewood logs in a teepee, bark sides and light cut ends', 'bark', 'feet on ash bed, tips open around flame core', 5)
    for a in (0.95, 2.2):
        d = Vector((math.cos(a), math.sin(a), 0))
        B.tube(d * 0.6 + Vector((0, 0, 0.08)), d * 0.22 + Vector((0, 0, 0.16)), 0.035, 5, 'wood_light')
    B.note('kindling sticks', 'wood_light', 'resting on ash bed', 2)


# ---------------------------------------------------------------- C06 log bench
def log_section(R, cut, sides=12, phase=0.0):
    """Polygon in the (x, z) plane centred at origin with the top sliced flat at z=cut."""
    raw = [(R * math.cos(phase + 2 * math.pi * i / sides), R * math.sin(phase + 2 * math.pi * i / sides))
           for i in range(sides)]
    pts = []
    for i in range(sides):
        p, q = raw[i], raw[(i + 1) % sides]
        if p[1] <= cut:
            pts.append(p)
        if (p[1] - cut) * (q[1] - cut) < 0:
            f = (cut - p[1]) / (q[1] - p[1])
            pts.append((p[0] + f * (q[0] - p[0]), cut))
    return pts


def build_bench(B):
    R, cut, zc, half = 0.3, 0.15, 0.45, 2.4
    sec = log_section(R, cut, 12, math.pi / 12)
    stations = [(-half, 0.95), (-half * 0.35, 1.0), (half * 0.4, 0.98), (half, 0.93)]
    # seat stays flat (z = zc + cut) while the log tapers slightly
    rings = [[Vector((x * sc, y, zc + cut if abs(z - cut) < 1e-6 else zc + cut - (cut - z) * sc))
              for x, z in sec] for y, sc in stations]
    top_idx = [i for i in range(len(sec)) if abs(sec[i][1] - cut) < 1e-6 and abs(sec[(i + 1) % len(sec)][1] - cut) < 1e-6]
    B.loft(rings, lambda s, i: 'wood_light' if i in top_idx else 'bark', cap_key='wood_light', inset=0.8, ring_key='bark')
    B.note('split-log seat, flat light top, bark sides, light end faces with bark ring', 'bark', 'main member')
    B.tube((0.2, 0.7, zc - 0.02), (0.34, 0.78, zc + 0.03), 0.06, 6, 'bark', cap_key='wood_light', r2=0.045)
    B.note('branch stub', 'bark', 'embedded in log')
    # r2: low half-log saddles (flat bottom) instead of full octagons that read as wheels
    cs = [(x, -z) for x, z in reversed(log_section(0.2, 0.05, 10, math.pi / 10))]
    for y in (-1.7, 1.7):
        # section lies in the (y, z) plane across the seat; extrude along X
        sec_yz = [(y + xx, 0.05 + zz) for xx, zz in cs]
        B.loft([[Vector((x, yy, zz)) for yy, zz in sec_yz] for x in (-0.38, 0.38)], 'bark', cap_key='wood_light',
               inset=0.75, ring_key='bark')
    B.note('half-log saddles (flat bottom on ground) supporting seat, seat bedded ~0.1 m into them', 'bark', 'embedded support', 2)


# ---------------------------------------------------------------- scene / export
SPEC = {
    'C03': ('大帐篷', lambda B: build_tent(B, TENTS['C03'])),
    'C04': ('小帐篷', lambda B: build_tent(B, TENTS['C04'])),
    'C05': ('石砌篝火坑与柴', build_firepit),
    'C06': ('原木长凳', build_bench),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def build(asset_id):
    reset()
    B = Builder()
    SPEC[asset_id][1](B)
    ledger = B.ledger
    me = B.finish(f'{asset_id}_mesh')
    xs = [v.co for v in me.vertices]
    lo = Vector([min(p[i] for p in xs) for i in range(3)])
    hi = Vector([max(p[i] for p in xs) for i in range(3)])
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    me.transform(Matrix.Translation(shift))
    obj = bpy.data.objects.new(f'{asset_id}_geo', me)
    root = bpy.data.objects.new(asset_id, None)
    root.empty_display_type = 'PLAIN_AXES'
    root['assetId'] = asset_id
    root['front'] = '+X'
    root['units'] = 'm'
    if asset_id in TENTS:
        p = TENTS[asset_id]
        # Runtime consumes the exact authored closed canvas shell; ropes and tiny trim are not blockers.
        me.calc_loop_triangles()
        verts = [[v.co.x, v.co.z, -v.co.y] for v in me.vertices]
        indices = [int(i) for tri in me.loop_triangles
                   if me.materials[tri.material_index].name == 'camp_canvas_orange'
                   for i in tri.vertices]
        root['collisionSchema'] = 'camp-tent-shell-v2'
        root['collisionVertices'] = [n for v in verts for n in v]
        root['collisionIndices'] = indices
        root['doorProfile'] = [n for yz in [(-p['dw'], 0), (-p['dw'], p['jamb']),
                              (-p['topw'], p['dh']), (p['topw'], p['dh']),
                              (p['dw'], p['jamb']), (p['dw'], 0)] for n in yz]
        root['tentParams'] = json.dumps(p)
        root['collisionNote'] = 'Exact closed canvas shell including gathered curtains, no ropes; shared local origin/Y-up with mesh.'
    obj.parent = root
    col = bpy.data.collections.new(f'{asset_id}_asset')
    bpy.context.scene.collection.children.link(col)
    col.objects.link(root)
    col.objects.link(obj)
    os.makedirs(f'{TOOLS}/blend', exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{TOOLS}/blend/{asset_id}.blend', compress=False)
    for o in bpy.context.scene.objects:
        o.select_set(o in (root, obj))
    bpy.context.view_layer.objects.active = root
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    need = ['export_draco_mesh_compression_enable', 'export_draco_position_quantization', 'use_selection',
            'export_apply', 'export_yup', 'export_extras', 'export_cameras', 'export_lights', 'export_animations']
    missing = [p for p in need if p not in props]
    if missing:
        raise RuntimeError(f'exporter lacks {missing}')
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=f'{GLB_DIR}/{asset_id}.glb', export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_normals=True, export_materials='EXPORT', export_extras=True,
        export_cameras=False, export_lights=False, export_animations=False, export_skins=False,
        export_morph=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=20, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_draco_generic_quantization=12)
    os.makedirs(DOCS, exist_ok=True)
    with open(f'{DOCS}/ledger_{asset_id}.json', 'w') as fh:
        json.dump(dict(asset=asset_id, name=SPEC[asset_id][0], recentre_shift=list(shift), parts=ledger), fh,
                  ensure_ascii=False, indent=2)
    print('BUILT', asset_id, len(me.polygons))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for aid in (argv or list(SPEC)):
        build(aid)
