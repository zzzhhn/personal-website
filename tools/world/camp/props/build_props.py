"""Camp L1 props (C07 desk, C08 book stack, C09 trophy shelf, C10 flagpole + 4 flags).

Run:  Blender -b --factory-startup -P build_props.py -- <repo_root> [C07 C08 ...]

Blender is Z-up, +X is the front/use side. The glTF exporter converts to +Y up once
(glTF x = Blender x, glTF y = Blender z, glTF z = -Blender y). No manual rotation.
Every asset is rebuilt from scratch in an empty scene, saved as .blend and exported
as GLB containing only the asset root and its meshes.
"""
import bpy, bmesh, math, sys, os, json
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = os.path.abspath(ARGS[0]) if ARGS else os.getcwd()
ONLY = set(ARGS[1:])
SRC_DIR = os.path.join(REPO, 'tools/world/camp/props')
BLEND_DIR = os.path.join(SRC_DIR, 'blend')
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')
GEN_VERSION = 'props-r3'
# Draco contract (2026-10-21 main-session addendum): compress final GLBs; 20-bit positions keep
# sub-micron to few-micron error on <=3.3 m assets. Normals 12 bits for crisp flat facets.
DRACO = dict(export_draco_mesh_compression_enable=True,
             export_draco_mesh_compression_level=6,
             export_draco_position_quantization=20,
             export_draco_normal_quantization=12,
             export_draco_generic_quantization=12)

# ---------------------------------------------------------------- materials
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

# name: (sRGB hex, materialRole, roughness, metallic)
MATS = {
    'props_wood_light':  ('#B99469', 'wood',   0.72, 0.0),
    'props_wood_mid':    ('#8E6E55', 'wood',   0.76, 0.0),
    'props_wood_dark':   ('#5A4634', 'wood',   0.80, 0.0),
    'props_paper':       ('#E6DCCB', 'paper',  0.90, 0.0),
    'props_cover_orange':('#E8803A', 'accent', 0.80, 0.0),
    'props_cover_slate': ('#4E647D', 'accent', 0.80, 0.0),
    'props_cover_olive': ('#7E8C3E', 'accent', 0.82, 0.0),
    'props_cover_brick': ('#8E6E55', 'accent', 0.82, 0.0),
    'props_brass_matte': ('#B8975A', 'metal',  0.55, 0.40),
    'props_iron_matte':  ('#5E5B57', 'metal',  0.70, 0.30),
    'props_canvas_orange':('#E8803A', 'canvas', 0.90, 0.0),
    'props_canvas_cream': ('#E6DCCB', 'canvas', 0.90, 0.0),
    'props_canvas_slate': ('#4E647D', 'canvas', 0.90, 0.0),
    'props_canvas_olive': ('#8AA24A', 'canvas', 0.90, 0.0),
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
    m.diffuse_color = hex_lin(hx)
    m['materialRole'] = role
    m['srgbHex'] = hx
    return m

# ---------------------------------------------------------------- geometry helpers
class Part:
    """Accumulates closed shells into one bmesh with per-face material slots."""
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def add(self, src, mat, mat_map=None):
        """Append bmesh src. mat applies to all faces unless mat_map {src_index: mat}."""
        orient_outward(src)
        vmap = {}
        for v in src.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            m = mat_map.get(f.material_index, mat) if mat_map else mat
            nf.material_index = self.slot(m)
        src.free()

def _bevel(bm, width):
    if width > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=width, offset_type='OFFSET',
                        profile_type='SUPERELLIPSE', segments=1, profile=0.5,
                        affect='EDGES', clamp_overlap=True)

def orient_outward(bm):
    """Make each closed shell consistently wound with positive signed volume.
    recalc_face_normals alone was observed to leave some inset/bevelled books inverted."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    seen = set()
    for f0 in bm.faces:
        if f0 in seen:
            continue
        shell, stack = [], [f0]
        seen.add(f0)
        while stack:
            f = stack.pop()
            shell.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        o = shell[0].verts[0].co
        vol = 0.0
        for f in shell:
            vs = [v.co - o for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6
        if vol < 0:
            bmesh.ops.reverse_faces(bm, faces=shell)

def box(mn, mx, bevel=0.0, top_scale=None):
    """Axis-aligned box from mn to mx; optional top face scale (taper) about its centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    c = [(a + b) / 2 for a, b in zip(mn, mx)]
    s = [b - a for a, b in zip(mn, mx)]
    for v in bm.verts:
        k = 1.0
        if top_scale and v.co.z > 0:
            k = top_scale
        v.co = Vector((c[0] + v.co.x * s[0] * k, c[1] + v.co.y * s[1] * k, c[2] + v.co.z * s[2]))
    _bevel(bm, bevel)
    return bm

def strut(p0, p1, r0, r1, sides, bevel=0.0, rot=0.0):
    """Prism/frustum between two points (closed)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides,
                          radius1=r0, radius2=r1, depth=d.length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(p0 + p1) / 2)
    _bevel(bm, bevel)
    return bm

def lathe(profile, sides, center=(0, 0, 0), rot=0.0):
    """Revolve [(r, z), ...] around Z. Ends with r == 0 become fans; result is closed."""
    bm = bmesh.new()
    cx, cy, cz = center
    rings = []
    for r, z in profile:
        if r <= 1e-9:
            rings.append([bm.verts.new((cx, cy, cz + z))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(rot + 2 * math.pi * i / sides),
                                        cy + r * math.sin(rot + 2 * math.pi * i / sides), cz + z))
                          for i in range(sides)])
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def torus(center, major, minor, seg_major, seg_minor, axis='Z'):
    """Closed torus; axis is the ring's normal ('Z' horizontal ring, 'X' ring in YZ plane)."""
    bm = bmesh.new()
    grid = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        row = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor + math.pi / seg_minor
            rr = major + minor * math.cos(b)
            p = Vector((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b)))
            if axis == 'X':
                p = Vector((p.z, p.x, p.y))
            elif axis == 'Y':
                p = Vector((p.x, p.z, p.y))
            row.append(bm.verts.new(Vector(center) + p))
        grid.append(row)
    for i in range(seg_major):
        for j in range(seg_minor):
            i2, j2 = (i + 1) % seg_major, (j + 1) % seg_minor
            bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j2], grid[i][j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def sphere(center, r, segs=8, rings=5):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return bm

# ---------------------------------------------------------------- scene / export
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

def bounds_of(parts):
    pts = [v.co for p in parts for v in p.bm.verts]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi

def finalize(asset_id, parts, pivots=None, root_extras=None, part_extras=None):
    """Recentre all parts on XY bounds centre with min Z = 0, then create objects.
    pivots: {part_name: Vector world-space object origin} (e.g. flag hoist points)."""
    pivots = pivots or {}
    part_extras = part_extras or {}
    lo, hi = bounds_of(parts)
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    root = bpy.data.objects.new(asset_id, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.2
    bpy.context.scene.collection.objects.link(root)
    objs = []
    for p in parts:
        pivot = (pivots.get(p.name, Vector((0, 0, 0))) + shift) if p.name in pivots else Vector((0, 0, 0))
        bmesh.ops.translate(p.bm, verts=p.bm.verts, vec=shift - pivot)
        # shells were already oriented by signed volume in Part.add; a global recalc here
        # re-inverted the concave recessed-page books in r1/r2, so it is intentionally omitted.
        me = bpy.data.meshes.new(p.name)
        p.bm.to_mesh(me)
        p.bm.free()
        for poly in me.polygons:
            poly.use_smooth = False
        for mname in p.slots:
            me.materials.append(get_mat(mname))
        ob = bpy.data.objects.new(p.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = root
        ob.location = pivot
        for k, v in part_extras.get(p.name, {}).items():
            ob[k] = v
        objs.append(ob)
    size = hi - lo
    root['assetId'] = asset_id
    root['generator'] = GEN_VERSION
    root['units'] = 'meters'
    root['front'] = '+X'
    root['up'] = '+Y (glTF)'
    root['designBoundsGLB_xyz'] = [round(size.x, 4), round(size.z, 4), round(size.y, 4)]
    root['materialRoles'] = sorted({MATS[m][1] for p in parts for m in p.slots})
    for k, v in (root_extras or {}).items():
        root[k] = v
    return root, objs, shift

def export(asset_id, root, objs):
    os.makedirs(BLEND_DIR, exist_ok=True)
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    blend = os.path.join(BLEND_DIR, f'{asset_id}.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    glb = os.path.join(GLB_DIR, f'{asset_id}.glb')
    rna = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    missing = [k for k in DRACO if k not in rna]
    if missing:
        raise RuntimeError(f'glTF exporter lacks Draco properties {missing}; refusing to export uncompressed')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_normals=True, export_materials='EXPORT',
        export_texcoords=False, export_tangents=False, export_cameras=False,
        export_lights=False, export_animations=False, export_extras=True, **DRACO)
    print(f'[props] wrote {blend} and {glb}')

# ---------------------------------------------------------------- C07 desk (+ stool on use side)
def build_C07():
    desk = Part('C07_desk')
    stool = Part('C07_stool')
    LT, MD = 'props_wood_light', 'props_wood_mid'
    # top: 0.8 deep (x), 2.0 long (y), surface at z = 0.85; toy-chunky members (r2)
    X0, X1, Y = -0.65, 0.15, 1.0
    TOP = 0.85
    desk.add(box((X0, -Y, TOP - 0.075), (X1, Y, TOP), bevel=0.016), LT)
    # tapered square legs (8 cm at foot), set in from the top edge, buried 1 cm into the top
    lx = (X0 + 0.12, X1 - 0.12)
    ly = (-(Y - 0.13), Y - 0.13)
    for x in lx:
        for y in ly:
            desk.add(box((x - 0.04, y - 0.04, 0.0), (x + 0.04, y + 0.04, TOP - 0.065),
                         bevel=0.008, top_scale=1.2), MD)
    # aprons (rails under the top), slightly inset from leg faces
    za0, za1 = TOP - 0.19, TOP - 0.07
    desk.add(box((lx[0] - 0.036, ly[0], za0), (lx[0] - 0.010, ly[1], za1), bevel=0.004), MD)   # back
    desk.add(box((lx[1] + 0.010, ly[0], za0), (lx[1] + 0.036, ly[1], za1), bevel=0.004), MD)   # front
    for y in ly:
        desk.add(box((lx[0], y - 0.013, za0), (lx[1], y + 0.013, za1), bevel=0.004), MD)
    # drawer front on the use (+X) side with a small pull
    xf = lx[1] + 0.036
    desk.add(box((xf - 0.004, -0.40, za0 + 0.015), (xf + 0.016, 0.40, za1 - 0.012), bevel=0.004), LT)
    desk.add(strut((xf + 0.012, 0, (za0 + za1) / 2), (xf + 0.045, 0, (za0 + za1) / 2),
                   0.02, 0.018, 6), MD)
    # H stretcher low between the legs
    for y in ly:
        desk.add(box((lx[0], y - 0.022, 0.12), (lx[1], y + 0.022, 0.18), bevel=0.005), MD)
    desk.add(box(((lx[0] + lx[1]) / 2 - 0.022, ly[0], 0.125), ((lx[0] + lx[1]) / 2 + 0.022, ly[1], 0.175),
                 bevel=0.004), MD)
    # stool at the use side, clear of the desk top edge
    # r3: 0.62 m seat suits the 0.85 m work-top (r2 0.55 read too low beside it)
    sx, sy, SEAT = 0.49, 0.30, 0.62
    stool.add(strut((sx, sy, SEAT - 0.06), (sx, sy, SEAT), 0.165, 0.16, 10, bevel=0.012), LT)
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3
        top = (sx + 0.085 * math.cos(a), sy + 0.085 * math.sin(a), SEAT - 0.05)
        foot = (sx + 0.13 * math.cos(a), sy + 0.13 * math.sin(a), 0.0)
        stool.add(strut(foot, top, 0.03, 0.033, 6, rot=a), MD)
    # rung ring between stool legs (three short rails)
    pts = []
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3
        t = 0.16 / (SEAT - 0.05)
        r = 0.13 + (0.085 - 0.13) * t
        pts.append(Vector((sx + r * math.cos(a), sy + r * math.sin(a), 0.16)))
    for k in range(3):
        a, b = pts[k], pts[(k + 1) % 3]
        d = (b - a).normalized() * 0.02
        stool.add(strut(a + d, b - d, 0.015, 0.015, 6), MD)
    root, objs, shift = finalize('C07', [desk, stool], root_extras={
        'deskTopHeight_m': TOP,
        'useSide': '+X',
        'notes': 'C07_stool is a separate node inside the declared 1.3 m depth; hide it at runtime if not wanted.',
    })
    # desk top usable rectangle in final GLB-local coordinates for placing C08
    root['deskTopRectGLB'] = {
        'y': TOP,
        'x': [round(X0 + shift.x + 0.03, 4), round(X1 + shift.x - 0.03, 4)],
        'z': [round(-(Y + shift.y) + 0.03, 4), round(-(-Y + shift.y) - 0.03, 4)],
    }
    export('C07', root, objs)

# ---------------------------------------------------------------- C08 book stack
def book(L, W, T, spine_side, cover, paper_inset=0.008):
    """Book lying flat: L along X, W along Y, T thick. Page block recessed on 3 sides."""
    bm = box((-L / 2, -W / 2, 0), (L / 2, W / 2, T))
    pages = []
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.5:
            continue
        if abs(n.y) > 0.5 and (n.y > 0) == (spine_side > 0):
            continue  # spine stays cover-coloured
        pages.append(f)
    res = bmesh.ops.inset_individual(bm, faces=pages, thickness=paper_inset, depth=-paper_inset)
    inner = set(pages)
    for f in bm.faces:
        f.material_index = 1 if f in inner else 0
    # rounded spine hint: bevel only the two spine edges
    spine_edges = [e for e in bm.edges if all((v.co.y * spine_side) > W / 2 - 1e-6 for v in e.verts)
                   and abs(e.verts[0].co.x - e.verts[1].co.x) > L * 0.5]
    if spine_edges:
        bmesh.ops.bevel(bm, geom=spine_edges, offset=T * 0.22, offset_type='OFFSET',
                        profile_type='SUPERELLIPSE', segments=1, profile=0.5, affect='EDGES',
                        clamp_overlap=True)
    return bm, {0: cover, 1: 'props_paper'}

def place(bm, x, y, z, rot):
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, z))
    return bm

def build_C08():
    books = Part('C08_books')
    # (L, W, T, spine side, cover, dx, dy, rotation deg)
    stack_a = [(0.42, 0.30, 0.070, -1, 'props_cover_slate', 0.000, 0.000, 0),
               (0.40, 0.28, 0.060, 1, 'props_cover_orange', 0.010, 0.004, -5),
               (0.38, 0.27, 0.075, -1, 'props_cover_olive', -0.008, -0.004, 4),
               (0.36, 0.25, 0.055, 1, 'props_cover_brick', 0.006, 0.006, -3),
               (0.34, 0.24, 0.065, -1, 'props_cover_orange', -0.004, -0.002, 7)]
    stack_b = [(0.37, 0.26, 0.065, 1, 'props_cover_olive', 0.0, 0.0, 0),
               (0.33, 0.24, 0.055, -1, 'props_cover_slate', 0.006, 0.0, 6)]
    for stack, (cx, cy, base_rot) in ((stack_a, (0.0, -0.18, 0.0)), (stack_b, (0.02, 0.20, -8.0))):
        z = 0.0
        for L, W, T, side, cover, dx, dy, rot in stack:
            bm, mm = book(L, W, T, side, cover)
            # sink 1 mm into the book below so stacked covers are not coplanar hairline gaps
            zz = max(0.0, z - 0.001)
            books.add(place(bm, cx + dx, cy + dy, zz, math.radians(rot + base_rot)), cover, mm)
            z = zz + T
    root, objs, _ = finalize('C08', [books], root_extras={
        'placement': 'origin at stack bottom centre; drop onto C07 deskTopRectGLB',
        'text': 'none (spines and covers intentionally blank)',
    })
    export('C08', root, objs)

# ---------------------------------------------------------------- C09 trophy shelf
def trophy(cx, cy, z0, h, mats, handles=True):
    """Wooden plinth + matte brass cup (hollow bowl, solid of revolution) + side handles."""
    out = []
    pw, ph = 0.075 * h / 0.32, 0.05 * h / 0.32
    out.append((box((cx - pw, cy - pw, z0), (cx + pw, cy + pw, z0 + ph), bevel=0.004), mats['base']))
    s = h / 0.32
    zc = z0 + ph - 0.002
    # simplified r2 profile: foot, stem knot, open bowl with a real rim and inner cavity
    prof = [(0, 0), (0.055, 0), (0.05, 0.02), (0.016, 0.045), (0.016, 0.10), (0.028, 0.115),
            (0.018, 0.13), (0.07, 0.19), (0.088, 0.262), (0.074, 0.262), (0.056, 0.205), (0, 0.19)]
    prof = [(r * s, z * s) for r, z in prof]
    out.append((lathe(prof, 10, (cx, cy, zc), rot=math.pi / 10), mats['metal']))
    if handles:
        for side in (-1, 1):
            out.append((torus((cx, cy + side * 0.083 * s, zc + 0.215 * s), 0.036 * s, 0.009 * s, 8, 4,
                              axis='X'), mats['metal']))
    return out

def build_C09():
    shelf = Part('C09_shelf')
    cups = Part('C09_trophies')
    MD, DK, LT = 'props_wood_mid', 'props_wood_dark', 'props_wood_light'
    # r2: lower, wider-reading carcass so trophies on top give a distinct skyline (total ~1.7 m)
    D0, D1 = -0.27, 0.27          # carcass depth (x), front at +X
    W = 0.86                      # half width (y)
    H = 1.16                      # carcass height
    t = 0.04
    # side panels
    shelf.add(box((D0, -W, 0), (D1, -W + t, H - t + 0.005), bevel=0.006), MD)
    shelf.add(box((D0, W - t, 0), (D1, W, H - t + 0.005), bevel=0.006), MD)
    # top board with small overhang
    shelf.add(box((D0 - 0.01, -W - 0.025, H - t), (D1 + 0.035, W + 0.025, H), bevel=0.008), LT)
    # recessed plinth (toe kick) and bottom shelf; shelves stop short of the back panel's outer
    # face so no coplanar back faces fight (r3 fix for strip seen in r2 back view)
    shelf.add(box((D0 + 0.02, -W + t - 0.005, 0), (D1 - 0.04, W - t + 0.005, 0.09), bevel=0.004), DK)
    shelf.add(box((D0 + 0.012, -W + t - 0.005, 0.09), (D1, W - t + 0.005, 0.13), bevel=0.005), LT)
    # back panel (dark so the cups read against it), set 4 mm proud of the side panels' back edge
    shelf.add(box((D0 - 0.004, -W + t - 0.005, 0.09), (D0 + 0.02, W - t + 0.005, H - t + 0.005)), DK)
    # centre divider and two intermediate shelves
    shelf.add(box((D0 + 0.015, -0.02, 0.125), (D1 - 0.01, 0.02, H - t + 0.005), bevel=0.005), MD)
    SH = 0.64                     # one intermediate shelf -> two tall compartment rows
    for z in (SH,):
        shelf.add(box((D0 + 0.015, -W + t - 0.005, z - 0.035), (D1 - 0.005, W - t + 0.005, z), bevel=0.005), LT)
    mats = {'base': DK, 'metal': 'props_brass_matte'}
    items = []
    items += trophy(0.0, 0.05, H - 0.002, 0.54, mats)             # big cup on top, centre
    items += trophy(0.0, -0.52, H - 0.002, 0.38, mats, handles=False)  # smaller goblet on top
    items += trophy(0.04, -0.44, SH - 0.002, 0.36, mats)          # upper-left compartment
    items += trophy(0.04, 0.46, 0.13 - 0.002, 0.34, mats, handles=False)  # lower-right compartment
    for bm, m in items:
        cups.add(bm, m)
    # two blank books lying in the lower-left compartment (no text)
    contents = Part('C09_books')
    z = 0.13 - 0.001
    for L, Wb, T, side, cover, rot in ((0.30, 0.22, 0.05, 1, 'props_cover_slate', 0),
                                       (0.27, 0.20, 0.045, -1, 'props_cover_orange', 9)):
        bm, mm = book(L, Wb, T, side, cover)
        contents.add(place(bm, 0.0, -0.45, z, math.radians(90 + rot)), cover, mm)
        z += T - 0.001
    # standing plaque (blank) in the upper-right compartment, leaning on the back panel
    plaque = box((-0.015, -0.14, 0.0), (0.015, 0.14, 0.36), bevel=0.005)
    inset = box((0.012, -0.10, 0.07), (0.021, 0.10, 0.29), bevel=0.002)
    for bm, m in ((plaque, MD), (inset, 'props_brass_matte')):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-12), 3, 'Y'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(D0 + 0.10, 0.44, SH - 0.003))
        cups.add(bm, m)
    # second blank plaque standing on top, right end
    plaque = box((-0.018, -0.13, 0.0), (0.018, 0.13, 0.30), bevel=0.005)
    inset = box((0.015, -0.09, 0.06), (0.024, 0.09, 0.24), bevel=0.002)
    for bm, m in ((plaque, MD), (inset, 'props_brass_matte')):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-8), 3, 'Y'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(-0.10, 0.58, H - 0.003))
        cups.add(bm, m)
    root, objs, _ = finalize('C09', [shelf, cups, contents], root_extras={
        'text': 'none (plaque intentionally blank)',
        'metalNote': 'matte brass, metallic 0.40 / roughness 0.55, not mirror gold',
    })
    export('C09', root, objs)

# ---------------------------------------------------------------- C10 flagpole + four flags
def flag_mesh(L, h, kind, pole_gap, wave=0.035, cols=6, thick=0.014):
    """Flag in local coords: hoist edge at y = pole_gap, z in [-h, 0] (top attach = origin).
    kind 'pennant' tapers to a point, 'swallow' has a forked fly end.
    r2: explicit two-sided slab (front/back sheets offset in X + rim quads) instead of
    bmesh.ops.solidify, which produced zero-area rim triangles here."""
    bm = bmesh.new()
    def wx(u):  # gentle baked ripple growing toward the fly end
        return wave * math.sin(2 * math.pi * u / (L * 0.75)) * (u / L)
    pts2d = []  # columns of (u, z) samples on the sheet
    for i in range(cols + 1):
        u = L * i / cols
        if kind == 'pennant':
            half = (h / 2) * (1 - u / L)
            if i == cols:
                pts2d.append([(u, -h / 2)])
                continue
            um = u
        else:
            half = (h / 2) * (1 - 0.1 * u / L)
            um = u * (L - 0.26 * L) / L  # notch
        pts2d.append([(u, -h / 2 + half), (um, -h / 2), (u, -h / 2 - half)])
    sheets = {}
    for side, sx in (('f', thick / 2), ('b', -thick / 2)):
        sheets[side] = [[bm.verts.new((wx(u) + sx, pole_gap + u, z)) for (u, z) in col] for col in pts2d]
    F, B = sheets['f'], sheets['b']
    for a, b in zip(range(len(F)), range(1, len(F))):
        fa, fb, ba, bb = F[a], F[b], B[a], B[b]
        if len(fb) == 1:
            bm.faces.new((fa[0], fa[1], fb[0])); bm.faces.new((fa[1], fa[2], fb[0]))
            bm.faces.new((bb[0], ba[1], ba[0])); bm.faces.new((bb[0], ba[2], ba[1]))
        else:
            bm.faces.new((fa[0], fa[1], fb[1], fb[0])); bm.faces.new((fa[1], fa[2], fb[2], fb[1]))
            bm.faces.new((ba[0], bb[0], bb[1], ba[1])); bm.faces.new((ba[1], bb[1], bb[2], ba[2]))
    # rim: walk the outline (top edge out, fly end, bottom edge back, hoist edge)
    n = len(F)
    if len(F[-1]) == 1:
        loop = [(i, 0) for i in range(n - 1)] + [(n - 1, 0)] + [(i, 2) for i in range(n - 2, -1, -1)]
    else:
        loop = ([(i, 0) for i in range(n)] + [(n - 1, 1)] + [(i, 2) for i in range(n - 1, -1, -1)])
    loop += [(0, 1)]
    for k in range(len(loop)):
        (i0, j0), (i1, j1) = loop[k], loop[(k + 1) % len(loop)]
        bm.faces.new((F[i0][j0], B[i0][j0], B[i1][j1], F[i1][j1]))
    # swallowtail notch: the mid vertices of inner columns are interior, but the last column's
    # mid vertex sits on the outline (handled above). Interior mids are shared by both triangles.
    return bm

def build_C10():
    stand = Part('C10_pole')
    DK, MD = 'props_wood_dark', 'props_wood_mid'
    POLE_TOP = 3.10
    r_bot, r_top = 0.05, 0.038
    def pole_r(z):
        return r_bot + (r_top - r_bot) * (z - 0.10) / (POLE_TOP - 0.10)
    stand.add(strut((0, 0, 0.10), (0, 0, POLE_TOP), r_bot, r_top, 8, rot=math.pi / 8), MD)
    stand.add(sphere((0, 0, POLE_TOP + 0.045), 0.06, 8, 5), 'props_brass_matte')
    stand.add(strut((0, 0, POLE_TOP - 0.02), (0, 0, POLE_TOP + 0.01), 0.046, 0.046, 8, rot=math.pi / 8),
              'props_brass_matte')
    # ground collar and four radiating feet with braces (real support)
    stand.add(box((-0.10, -0.10, 0.0), (0.10, 0.10, 0.36), bevel=0.012, top_scale=0.8), DK)
    FOOT = 0.50
    for ang in (0, 90, 180, 270):
        R = Matrix.Rotation(math.radians(ang), 3, 'Z')
        foot = box((0.06, -0.05, 0.0), (FOOT, 0.05, 0.09), bevel=0.01, top_scale=None)
        bmesh.ops.rotate(foot, verts=foot.verts, cent=(0, 0, 0), matrix=R)
        stand.add(foot, DK)
        a = R @ Vector((FOOT - 0.09, 0, 0.075))
        zb = 0.72
        b = R @ Vector((pole_r(zb) - 0.015, 0, zb))
        stand.add(strut(a, b, 0.03, 0.026, 6), MD)
    flags = []
    pivots = {}
    extras = {}
    spec = [('flag_01', 'pennant', 'props_canvas_orange'),
            ('flag_02', 'swallow', 'props_canvas_cream'),
            ('flag_03', 'pennant', 'props_canvas_slate'),
            ('flag_04', 'swallow', 'props_canvas_olive')]
    h, gap_between, L = 0.36, 0.09, 0.95
    z_top = 2.96
    for i, (name, kind, mat) in enumerate(spec):
        zt = z_top - i * (h + gap_between)
        zb = zt - h
        rt, rb = pole_r(zt), pole_r(zb)
        # two clip rings per flag around the pole (fixed structure)
        for z, r in ((zt, rt), (zb, rb)):
            stand.add(torus((0, 0, z), r + 0.007, 0.009, 8, 4, axis='Z'), 'props_iron_matte')
        p = Part(name)
        p.add(flag_mesh(L, h, kind, pole_gap=rt + 0.004), mat)
        bmesh.ops.translate(p.bm, verts=p.bm.verts, vec=(0, 0, zt))
        flags.append(p)
        pivots[name] = Vector((0, 0, zt))
        extras[name] = {
            'role': 'wind-flag',
            'pivot': 'node origin = top clip on pole axis; rotate about local +Y (glTF) for sway',
            'hoistTopLocalGLB': [0.0, 0.0, -(rt + 0.004)],
            'hoistBottomLocalGLB': [0.0, -h, -(rt + 0.004)],
            'flyDirectionGLB': [0, 0, -1],
            'lengthM': L, 'hoistHeightM': h, 'shape': kind,
        }
    root, objs, shift = finalize('C10', [stand] + flags, pivots=pivots, part_extras=extras, root_extras={
        'animatedNodes': [s[0] for s in spec],
        'staticNodes': ['C10_pole'],
        'text': 'none (flags intentionally blank)',
    })
    root['poleAxisGLB_xz'] = [round(shift.x, 4), round(-shift.y, 4)]
    export('C10', root, objs)

BUILDERS = {'C07': build_C07, 'C08': build_C08, 'C09': build_C09, 'C10': build_C10}

if __name__ == '__main__':
    for aid, fn in BUILDERS.items():
        if ONLY and aid not in ONLY:
            continue
        reset_scene()
        fn()
