"""Shared Blender helpers for the town L1 assets (see docs/world/town/DESIGN.md).

Blender Z-up, +X = building front (the avenue side). Building origin = footprint centre on the ground
(min Z = 0). The glTF exporter converts to +Y up once; no manual rotation anywhere.
Every asset: visible meshes (one object per part, multi-material), `col_*` convex collider meshes
(8+ points each, never rendered), and `anchor_*` empties carrying runtime attachment extras.
"""
import bpy, bmesh, math, os, hashlib
from mathutils import Vector, Matrix

GEN_VERSION = 'town-r1'
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=16, export_draco_normal_quantization=12,
             export_draco_generic_quantization=12)

def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hex_lin(h):
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

# name: (sRGB hex, roughness, metallic, emissive hex or None)
MATS = {
    'town_stone': ('#D6CFC2', 0.85, 0.0, None),
    'town_stone_dark': ('#B8AF9F', 0.88, 0.0, None),
    'town_cream': ('#E6DCCB', 0.90, 0.0, None),
    'town_slate': ('#4E647D', 0.80, 0.0, None),
    'town_brick': ('#8E6E55', 0.85, 0.0, None),
    'town_sand': ('#C8AE86', 0.90, 0.0, None),
    'town_dark': ('#2F3742', 0.70, 0.0, None),
    'town_trim': ('#EEE8DD', 0.80, 0.0, None),
    'town_metal': ('#5E5B57', 0.65, 0.3, None),
    'town_roof': ('#8F8A82', 0.95, 0.0, None),
    'town_wood': ('#6E5440', 0.80, 0.0, None),
    'town_glass_dark': ('#33424F', 0.35, 0.0, None),
    'town_glass_lit': ('#3A4856', 0.35, 0.0, '#FFC978'),
    'town_screen': ('#252D35', 0.60, 0.0, None),
    'town_cyan': ('#4FD1C5', 0.60, 0.0, '#4FD1C5'),
    'town_canvas': ('#E8803A', 0.90, 0.0, None),
    'town_canvas_cream': ('#E6DCCB', 0.90, 0.0, None),
    'palm_trunk': ('#7A6248', 0.90, 0.0, None),
    'palm_leaf': ('#7A9442', 0.80, 0.0, None),
    'palm_leaf_dark': ('#5F7A34', 0.80, 0.0, None),
}

def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hx, rough, metal, em = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_lin(hx)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if em:
        # exported as emissiveFactor; the runtime drives the intensity from night.value
        b.inputs['Emission Color'].default_value = hex_lin(em)
        b.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = hex_lin(hx)
    m['srgbHex'] = hx
    return m

def lit(key, share=0.6):
    """Deterministic ~60 % lit window choice."""
    return int(hashlib.md5(key.encode()).hexdigest()[:6], 16) / 0xFFFFFF < share

# ------------------------------------------------------------------ primitives (closed shells)
def orient_outward(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    seen = set()
    for f0 in bm.faces:
        if f0 in seen:
            continue
        shell, stack = [], [f0]
        seen.add(f0)
        while stack:
            f = stack.pop(); shell.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g); stack.append(g)
        o = shell[0].verts[0].co
        vol = 0.0
        for f in shell:
            vs = [v.co - o for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6
        if vol < 0:
            bmesh.ops.reverse_faces(bm, faces=shell)

def _bevel(bm, w):
    if w > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=w, offset_type='OFFSET', profile_type='SUPERELLIPSE',
                        segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)

def box(mn, mx, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    c = [(a + b) / 2 for a, b in zip(mn, mx)]
    s = [b - a for a, b in zip(mn, mx)]
    assert min(s) > 1e-5, (mn, mx)
    for v in bm.verts:
        v.co = Vector((c[0] + v.co.x * s[0], c[1] + v.co.y * s[1], c[2] + v.co.z * s[2]))
    _bevel(bm, min(bevel, min(s) * 0.3))
    return bm

def xform(bm, mat):
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    return bm

def rot_z(bm, angle, pivot=(0, 0, 0)):
    p = Vector(pivot)
    return xform(bm, Matrix.Translation(p) @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation(-p))

def lathe(profile, sides, center=(0, 0, 0), rot=0.0):
    bm = bmesh.new()
    cx, cy, cz = center
    rings = []
    for r, z in profile:
        if r <= 1e-9:
            rings.append([bm.verts.new((cx, cy, cz + z))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(rot + 2 * math.pi * i / sides),
                                        cy + r * math.sin(rot + 2 * math.pi * i / sides), cz + z)) for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    return bm

def cyl(c, r, z0, z1, sides=12, r1=None, rot=0.0):
    return lathe([(r, 0), (r if r1 is None else r1, z1 - z0)], sides, (c[0], c[1], z0), rot)

def arc_wall(c, r0, r1, a0, a1, z0, z1, segs):
    """Closed annular sector (curved wall) around vertical axis at c, angles in radians."""
    bm = bmesh.new()
    ring = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        ca, sa = math.cos(a), math.sin(a)
        ring.append([bm.verts.new((c[0] + r * ca, c[1] + r * sa, z)) for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1))])
    for a, b in zip(ring, ring[1:]):
        for k in range(4):
            l = (k + 1) % 4
            bm.faces.new((a[k], b[k], b[l], a[l]))
    bm.faces.new(ring[0]); bm.faces.new(list(reversed(ring[-1])))
    return bm

def prism(pts, z0, z1):
    """Closed vertical prism from a convex/simple XY polygon."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(list(reversed(lo))); bm.faces.new(hi)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    return bm

def gable(x0, x1, y0, y1, z0, apex):
    """Closed triangular prism: triangle in the YZ plane (base y0..y1 at z0, apex at mid y), extruded x0..x1."""
    bm = bmesh.new()
    ym = (y0 + y1) / 2
    a = [bm.verts.new((x0, y, z)) for y, z in ((y0, z0), (y1, z0), (ym, apex))]
    b = [bm.verts.new((x1, y, z)) for y, z in ((y0, z0), (y1, z0), (ym, apex))]
    bm.faces.new(a); bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return bm

# ------------------------------------------------------------------ asset accumulator
class Asset:
    def __init__(self, aid):
        self.id = aid
        self.parts = {}           # name -> [bm, slots]
        self.part = aid + '_body'
        self.cols = []            # (name, bm)
        self.anchors = []         # (name, location, extras)
        self.extras = {}
        self.part_extras = {}
        self.winds = {}

    def use(self, name):
        self.part = name
        return self

    def add(self, src, mat, smooth=False, closed=True, wind=None):
        """wind: callable(co) -> (bend, branch, leaf, phase) stored as the _WIND point attribute."""
        if closed:
            orient_outward(src)
        src.normal_update()
        bm, slots = self.parts.setdefault(self.part, [bmesh.new(), []])
        if mat not in slots:
            slots.append(mat)
        mi = slots.index(mat)
        vmap = {v: bm.verts.new(v.co) for v in src.verts}
        if wind is not None:
            wl = self.winds.setdefault(self.part, {})
            for v, nv in vmap.items():
                wl[nv] = wind(v.co)
        for f in src.faces:
            nf = bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mi
            nf.smooth = bool(smooth) and abs(f.normal.z) < 0.7
        src.free()

    def box(self, mn, mx, mat, bevel=0.0, col=False):
        self.add(box(mn, mx, bevel), mat)
        if col:
            self.col_box(mn, mx)

    def col_box(self, mn, mx, name=None):
        self.col_bm(box(mn, mx), name)

    def col_bm(self, bm, name=None):
        self.cols.append((name or f'col_{len(self.cols):02d}', bm))

    def anchor(self, name, loc, **extras):
        self.anchors.append((name, Vector(loc), extras))

class Face:
    """A wall plane: axis 'x' or 'y', outward sign, plane coordinate. n = outward offset from the
    plane, u = horizontal coordinate along the wall (world Y for x-walls, world X for y-walls)."""
    def __init__(self, axis, sign, plane):
        self.axis, self.sign, self.plane = axis, sign, plane

    def box(self, n0, n1, u0, u1, z0, z1):
        a, b = sorted((self.plane + self.sign * n0, self.plane + self.sign * n1))
        u0, u1 = sorted((u0, u1))
        return ((a, u0, z0), (b, u1, z1)) if self.axis == 'x' else ((u0, a, z0), (u1, b, z1))

    def point(self, n, u, z):
        p = self.plane + self.sign * n
        return (p, u, z) if self.axis == 'x' else (u, p, z)

def wall(A, F, u0, u1, z0, z1, mat, depth=0.2):
    A.box(*F.box(-depth, 0, u0, u1, z0, z1), mat)

def window(A, F, a, b, lo, hi, key, depth=0.2, recess=0.14, frame='town_trim', sill='town_trim', mullion=True, sill_out=0.06, glass=None, sill_bevel=0.012):
    """Glazing inside an opening (a..b along u, lo..hi in z) whose reveals are already built."""
    g = glass or ('town_glass_lit' if lit(key) else 'town_glass_dark')
    A.box(*F.box(-depth - 0.03, -recess, a, b, lo, hi), g)
    t, fn0, fn1 = 0.06, -recess - 0.01, -recess + 0.035
    A.box(*F.box(fn0, fn1, a, a + t, lo, hi), frame)
    A.box(*F.box(fn0, fn1, b - t, b, lo, hi), frame)
    A.box(*F.box(fn0, fn1, a + t, b - t, hi - t, hi), frame)
    A.box(*F.box(fn0, fn1, a + t, b - t, lo, lo + t), frame)
    if mullion and b - a > 1.0:
        m = (a + b) / 2
        A.box(*F.box(fn0, fn1 - 0.01, m - 0.03, m + 0.03, lo + t, hi - t), frame)
    if mullion and hi - lo > 1.6:
        tz = lo + (hi - lo) * 0.72
        A.box(*F.box(fn0, fn1 - 0.01, a + t, b - t, tz - 0.025, tz + 0.025), frame)
    if sill:
        A.box(*F.box(-recess, sill_out, a - 0.07, b + 0.07, lo - 0.08, lo), sill, bevel=sill_bevel)

def facade(A, F, u0, u1, z0, z1, cols, rows, ww, wh, mat, key, depth=0.2, recess=0.14, skip=(), sill=True,
           frame='town_trim', sill_mat='town_trim', mullion=True, wz=0.5, col=False, glass=None, sill_bevel=0.012):
    """Wall slab u0..u1 x z0..z1 with a regular grid of real recessed openings.
    Returns the list of opening rects (c, r, a, b, lo, hi)."""
    pitch, fh = (u1 - u0) / cols, (z1 - z0) / rows
    colu = [(u0 + c * pitch + (pitch - ww) / 2, u0 + c * pitch + (pitch + ww) / 2) for c in range(cols)]
    rowz = [(z0 + r * fh + (fh - wh) * wz, z0 + r * fh + (fh - wh) * wz + wh) for r in range(rows)]
    edges = [u0] + [x for ab in colu for x in ab] + [u1]
    for i in range(0, len(edges), 2):
        if edges[i + 1] - edges[i] > 1e-4:
            A.box(*F.box(-depth, 0, edges[i], edges[i + 1], z0, z1), mat)
    out = []
    for c, (a, b) in enumerate(colu):
        segs, cur = [], z0
        for r, (lo, hi) in enumerate(rowz):
            if (c, r) in skip:
                continue
            segs.append((cur, lo)); cur = hi
            out.append((c, r, a, b, lo, hi))
        segs.append((cur, z1))
        for s0, s1 in segs:
            if s1 - s0 > 1e-4:
                A.box(*F.box(-depth, 0, a, b, s0, s1), mat)
    for c, r, a, b, lo, hi in out:
        window(A, F, a, b, lo, hi, f'{key}:{c}:{r}', depth, recess, frame, sill_mat if sill else None, mullion, glass=glass, sill_bevel=sill_bevel)
    if col:
        A.col_box(*F.box(-depth, 0, u0, u1, z0, z1))
    return out

# ------------------------------------------------------------------ scene / export
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'

def finalize(A):
    root = bpy.data.objects.new(A.id, None)
    bpy.context.scene.collection.objects.link(root)
    objs = [root]
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for name, (bm, slots) in A.parts.items():
        me = bpy.data.meshes.new(name)
        wl = A.winds.get(name)
        vals = None
        if wl is not None:
            bm.verts.index_update()
            vals = [wl.get(v, (0.0, 0.0, 0.0, 0.0)) for v in bm.verts]
        bm.to_mesh(me); bm.free()
        if vals is not None:
            at = me.attributes.new('_WIND', 'FLOAT_COLOR', 'POINT')
            for i, c in enumerate(vals):
                at.data[i].color = c
        for m in slots:
            me.materials.append(get_mat(m))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        for k, v in A.part_extras.get(name, {}).items():
            ob[k] = v
        for v in me.vertices:
            lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
        objs.append(ob)
    for name, bm in A.cols:
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        ob['collider'] = 'convex'
        objs.append(ob)
    for name, loc, extras in A.anchors:
        e = bpy.data.objects.new(name, None)
        e.location = loc
        bpy.context.scene.collection.objects.link(e)
        e.parent = root
        for k, v in extras.items():
            e[k] = v
        objs.append(e)
    root['assetId'] = A.id
    root['generator'] = GEN_VERSION
    root['front'] = '+X'
    root['boundsBlender'] = [list(map(lambda x: round(x, 4), lo)), list(map(lambda x: round(x, 4), hi))]
    for k, v in A.extras.items():
        root[k] = v
    return objs, lo, hi

def export(A, objs, repo, sub='town'):
    blend_dir = os.path.join(repo, 'tools/world/town/blend')
    glb_dir = os.path.join(repo, 'public/assets/world', sub)
    os.makedirs(blend_dir, exist_ok=True); os.makedirs(glb_dir, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, f'{A.id}.blend'), compress=True)
    glb = os.path.join(glb_dir, f'{A.id}.glb')
    extra = {}
    rna = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    if 'export_attributes' in rna:
        extra['export_attributes'] = True
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_normals=True, export_materials='EXPORT', export_texcoords=False,
        export_tangents=False, export_cameras=False, export_lights=False, export_animations=False,
        export_extras=True, **extra, **DRACO)
    print(f'[town] wrote {glb}')
    return glb
