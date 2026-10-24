"""Shared Blender helpers for the park assets (P01-P19).

Blender is Z-up; asset front (use / opening side) is Blender -Y, which the glTF exporter turns into
+Z once (glTF x = Blender x, glTF y = Blender z, glTF z = -Blender y). No manual rotation.
Assets are rebuilt from scratch in an empty scene; only the asset roots and their meshes export.
Collision is authored in the same local frame and stored on the root as glTF extras.
"""
import bpy, bmesh, math, os, json, sys
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = os.getcwd()
PARK_DIR = os.path.join(REPO, 'tools/world/park')
BLEND_DIR = os.path.join(PARK_DIR, 'blend')
GLB_DIR = os.path.join(REPO, 'public/assets/world/park')
EVIDENCE = '/Users/bobby/Desktop/3D-personal-world/evidence/park'
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=20, export_draco_normal_quantization=12,
             export_draco_generic_quantization=12)

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

# name: (sRGB hex, role, roughness, metallic, emission hex or None)
MATS = {
    'park_slate_paint':  ('#4E647D', 'paint', 0.86, 0.0, None),
    'park_roof_slate':   ('#3A4A5C', 'paint', 0.9, 0.0, None),
    'park_cream_paint':  ('#E6DCCB', 'paint', 0.9, 0.0, None),
    'park_wood_light':   ('#B99469', 'wood', 0.74, 0.0, None),
    'park_wood_mid':     ('#8E6E55', 'wood', 0.78, 0.0, None),
    'park_wood_dark':    ('#5A4634', 'wood', 0.82, 0.0, None),
    'park_wood_deck':    ('#9C7A58', 'wood', 0.8, 0.0, None),
    'park_stone':        ('#8A8580', 'stone', 0.92, 0.0, None),
    'park_stone_dark':   ('#8C8276', 'stone', 0.94, 0.0, None),
    'park_stone_light':  ('#B4A896', 'stone', 0.92, 0.0, None),
    'park_brass_matte':  ('#B8975A', 'metal', 0.55, 0.4, None),
    'park_iron_matte':   ('#5E5B57', 'metal', 0.7, 0.3, None),
    'park_rubber':       ('#2B2A29', 'rubber', 0.95, 0.0, None),
    'park_canvas_cream': ('#E6DCCB', 'canvas', 0.92, 0.0, None),
    'park_canvas_olive': ('#7E8C3E', 'canvas', 0.92, 0.0, None),
    'park_canvas_orange':('#E8803A', 'canvas', 0.9, 0.0, None),
    'park_glass_frosted':('#D9D2C2', 'glass', 0.5, 0.0, None),
    'park_screen':       ('#1C2A33', 'screen', 0.45, 0.0, None),
    'park_chalkboard':   ('#2F3D38', 'paint', 0.95, 0.0, None),
    'park_accent_slate': ('#4E647D', 'accent', 0.8, 0.0, None),
    'park_accent_olive': ('#8AA24A', 'accent', 0.8, 0.0, None),
    'park_accent_orange':('#E8803A', 'accent', 0.8, 0.0, None),
    'park_accent_brick': ('#8E6E55', 'accent', 0.82, 0.0, None),
    'park_vinyl':        ('#1E1D1C', 'vinyl', 0.45, 0.0, None),
    'park_cyan_glow':    ('#4FD1C5', 'light', 0.6, 0.0, '#4FD1C5'),
    'park_bulb_warm':    ('#FFE2B0', 'light', 0.5, 0.0, '#FFC978'),
}

def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hx, role, rough, metal, emit = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_lin(hx)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = hex_lin(emit)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = hex_lin(hx)
    m['materialRole'] = role
    m['srgbHex'] = hx
    return m

# ---------------------------------------------------------------- geometry
def orient_outward(bm):
    """Consistent winding with positive signed volume per closed shell."""
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

class Part:
    """Closed shells accumulated into one bmesh with per-face material slots."""
    def __init__(self, name, smooth=False):
        self.name = name; self.bm = bmesh.new(); self.slots = []; self.smooth = smooth
    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)
    def add(self, src, mat, xform=None, smooth=None):
        orient_outward(src)
        if xform is not None:
            bmesh.ops.transform(src, matrix=xform, verts=src.verts)
            if xform.determinant() < 0:
                bmesh.ops.reverse_faces(src, faces=src.faces)
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        idx = self.slot(mat)
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = idx
            nf.smooth = self.smooth if smooth is None else smooth
        src.free()
        return self

def _bevel(bm, width, segments=1):
    if width > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=width, offset_type='OFFSET',
                        profile_type='SUPERELLIPSE', segments=segments, profile=0.5,
                        affect='EDGES', clamp_overlap=True)

def box(mn, mx, bevel=0.0, inset=0.0, top_scale=None):
    """Axis-aligned box mn..mx. inset shrinks the top face by that many metres on each side (a cheap
    chamfered plank top, 12 triangles). bevel is a real one-segment bevel on every edge."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    c = [(a + b) / 2 for a, b in zip(mn, mx)]
    s = [b - a for a, b in zip(mn, mx)]
    for v in bm.verts:
        x, y = v.co.x * s[0], v.co.y * s[1]
        if v.co.z > 0:
            if inset:
                x -= math.copysign(inset, v.co.x); y -= math.copysign(inset, v.co.y)
            if top_scale:
                x *= top_scale; y *= top_scale
        v.co = Vector((c[0] + x, c[1] + y, c[2] + v.co.z * s[2]))
    _bevel(bm, bevel)
    return bm

def prism(profile, a0, a1, axis='X', bevel=0.0):
    """Extrude a convex 2D profile along an axis from a0 to a1.
    axis X: profile is (y, z); axis Y: (x, z); axis Z: (x, y)."""
    bm = bmesh.new()
    def P(u, v, a):
        return {'X': (a, u, v), 'Y': (u, a, v), 'Z': (u, v, a)}[axis]
    f0 = [bm.verts.new(P(u, v, a0)) for u, v in profile]
    f1 = [bm.verts.new(P(u, v, a1)) for u, v in profile]
    n = len(profile)
    bm.faces.new(f0); bm.faces.new(list(reversed(f1)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((f0[i], f0[j], f1[j], f1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel(bm, bevel)
    return bm

def strut(p0, p1, r0, r1, sides, bevel=0.0, rot=0.0):
    """Prism/frustum between two points (closed)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r0, radius2=r1, depth=d.length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(p0 + p1) / 2)
    _bevel(bm, bevel)
    return bm

def lathe(profile, sides, center=(0, 0, 0), rot=0.0):
    """Revolve [(r, z), ...] around Z. r == 0 ends become fans; result is closed."""
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def torus(center, major, minor, seg_major, seg_minor, axis='Z'):
    bm = bmesh.new(); grid = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major; row = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor + math.pi / seg_minor
            rr = major + minor * math.cos(b)
            p = Vector((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b)))
            if axis == 'X': p = Vector((p.z, p.x, p.y))
            elif axis == 'Y': p = Vector((p.x, p.z, p.y))
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

def rot_z(deg, about=(0, 0, 0)):
    c = Vector(about)
    return Matrix.Translation(c) @ Matrix.Rotation(math.radians(deg), 4, 'Z') @ Matrix.Translation(-c)

def rot_x(deg, about=(0, 0, 0)):
    c = Vector(about)
    return Matrix.Translation(c) @ Matrix.Rotation(math.radians(deg), 4, 'X') @ Matrix.Translation(-c)

# ---------------------------------------------------------------- collision authoring
def glb_point(p):
    """Blender local point -> glTF local point (x, z, -y)."""
    return [round(p[0], 5), round(p[2], 5), round(-p[1], 5)]

def hull_box(mn, mx, xform=None):
    pts = [Vector((x, y, z)) for x in (mn[0], mx[0]) for y in (mn[1], mx[1]) for z in (mn[2], mx[2])]
    if xform is not None:
        pts = [xform @ p for p in pts]
    return [c for p in pts for c in glb_point(p)]

def hull_points(points):
    return [c for p in points for c in glb_point(p)]

# ---------------------------------------------------------------- scene / export
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

def make_root(name, extras=None, location=(0, 0, 0)):
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.location = location
    bpy.context.scene.collection.objects.link(root)
    for k, v in (extras or {}).items():
        root[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
    return root

def make_object(part, parent, location=(0, 0, 0), extras=None):
    """Part geometry is authored in parent space; location becomes the node origin (pivot)."""
    bmesh.ops.translate(part.bm, verts=part.bm.verts, vec=-Vector(location))
    me = bpy.data.meshes.new(part.name)
    part.bm.to_mesh(me); part.bm.free()
    for name in part.slots:
        me.materials.append(get_mat(name))
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = location
    for k, v in (extras or {}).items():
        ob[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
    return ob

def export(asset_id, roots):
    os.makedirs(BLEND_DIR, exist_ok=True); os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    blend = os.path.join(BLEND_DIR, f'{asset_id}.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    glb = os.path.join(GLB_DIR, f'{asset_id}.glb')
    rna = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    missing = [k for k in DRACO if k not in rna]
    if missing:
        raise RuntimeError(f'exporter lacks Draco {missing}')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_normals=True, export_materials='EXPORT', export_texcoords=False,
        export_tangents=False, export_cameras=False, export_lights=False, export_animations=False,
        export_extras=True, **DRACO)
    return blend, glb

# ---------------------------------------------------------------- QA
def inspect(objs, weld=False):
    dg = bpy.context.evaluated_depsgraph_get()
    rows, pts, problems = [], [], []
    for ob in objs:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg); me = ev.to_mesh()
        me.calc_loop_triangles()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        bm = bmesh.new(); bm.from_mesh(me)
        if weld:  # disposable diagnostic copy: glTF splits vertices at flat normals / materials
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        degenerate = sum(f.calc_area() < 1e-9 for f in bm.faces)
        nonman = sum(not e.is_manifold for e in bm.edges)
        # per-shell signed volume
        bm.faces.ensure_lookup_table(); seen = set(); neg = 0; shells = 0
        for f0 in bm.faces:
            if f0 in seen: continue
            shells += 1; stack = [f0]; seen.add(f0); vol = 0.0; o = f0.verts[0].co.copy()
            while stack:
                f = stack.pop(); vs = [v.co - o for v in f.verts]
                for i in range(1, len(vs) - 1): vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6
                for e in f.edges:
                    for g in e.link_faces:
                        if g not in seen: seen.add(g); stack.append(g)
            if vol <= 0: neg += 1
        bm.free()
        row = dict(name=ob.name, triangles=len(me.loop_triangles), shells=shells, negative_shells=neg,
                   degenerate_faces=degenerate, nonmanifold_edges=nonman, materials=[m.name for m in ob.data.materials])
        rows.append(row)
        if degenerate or neg or nonman:
            problems.append(row)
        ev.to_mesh_clear()
    lo = [min(p[i] for p in pts) for i in range(3)] if pts else [0] * 3
    hi = [max(p[i] for p in pts) for i in range(3)] if pts else [0] * 3
    return dict(triangles=sum(r['triangles'] for r in rows), bounds_min=[round(v, 4) for v in lo],
                bounds_max=[round(v, 4) for v in hi], objects=rows, problems=problems)

def readback(glb):
    """Fresh scene import of the exported GLB."""
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = list(bpy.context.scene.objects)
    rep = inspect(objs, weld=True)
    rep['nodes'] = sorted(o.name for o in objs)
    rep['materials'] = sorted({m.name for o in objs if o.type == 'MESH' for m in o.data.materials if m})
    return rep

# ---------------------------------------------------------------- preview render (colour, studio)
VIEWS = {
    '34_front': Vector((-1.0, -1.3, 0.8)), 'front': Vector((0, -1, 0.18)), '34_back': Vector((1.1, 1.2, 0.85)),
    'side': Vector((1, 0, 0.15)), 'top': Vector((0, -0.001, 1)), 'near_in': Vector((-0.35, -1, 0.35)),
}

def render_views(objs, out_prefix, views=('34_front', 'front', '34_back', 'side'), res=900, night=False, focus=None):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'CYCLES'
    scene.render.resolution_x = scene.render.resolution_y = res
    scene.view_settings.view_transform = 'Standard'
    if scene.render.engine == 'BLENDER_EEVEE_NEXT':
        scene.eevee.taa_render_samples = 24
    world = bpy.data.worlds.new('studio'); world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.05, 0.07, 0.12, 1) if night else (0.62, 0.66, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.25 if night else 0.6
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -3.2 if focus is None else focus.get('floor', -0.001)))
    floor = bpy.context.object; floor.name = 'studio_floor'
    fm = bpy.data.materials.new('studio_floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.22, 0.24, 1) if night else (0.2, 0.38, 0.4, 1)
    floor.data.materials.append(fm)
    sun = bpy.data.lights.new('key', 'SUN'); sun.energy = 0.35 if night else 3.2; sun.angle = math.radians(6)
    sun.color = (0.55, 0.62, 0.85) if night else (1.0, 0.85, 0.66)
    so = bpy.data.objects.new('key', sun); so.rotation_euler = (math.radians(62), 0, math.radians(-125)); scene.collection.objects.link(so)
    fill = bpy.data.lights.new('fill', 'SUN'); fill.energy = 0.15 if night else 0.9; fill.color = (0.56, 0.65, 0.77)
    fo = bpy.data.objects.new('fill', fill); fo.rotation_euler = (math.radians(55), 0, math.radians(60)); scene.collection.objects.link(fo)
    for m in bpy.data.materials:
        if m.use_nodes and 'Principled BSDF' in m.node_tree.nodes and m.get('materialRole') == 'light':
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 4.0 if night else 0.6
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type == 'MESH':
            ev = o.evaluated_get(dg); pts += [ev.matrix_world @ v.co for v in ev.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center = (lo + hi) / 2 if focus is None else Vector(focus['center'])
    camd = bpy.data.cameras.new('cam'); camd.lens = 50; camd.clip_end = 400
    cam = bpy.data.objects.new('cam', camd); scene.collection.objects.link(cam); scene.camera = cam
    radius = (hi - lo).length / 2 if focus is None else focus['radius']
    files = []
    for name in views:
        d = VIEWS[name].normalized()
        cam.location = center + d * radius * 2.9
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{out_prefix}_{name}{"_night" if night else ""}.png'
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    return files

def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=1)
