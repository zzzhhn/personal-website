"""Camp L1 nature group: G16-G23 (trees, bushes, rocks).

Run:  Blender -b --factory-startup -P tools/world/camp/nature/build_nature.py [-- G16 G21 ...]

Blender is Z-up, metres, +X front. The glTF exporter converts to +Y up exactly
once. Each asset is ONE mesh object (one node) with one material slot per
material, so a GLB has one primitive (draw call) per material.

Relationship model (see README):
  * wood: trunk + branches are an Exact-Boolean union -> one continuous surface.
  * foliage clumps: embedded distinct closed shells. Every clump overlaps a
    neighbour clump and/or receives a buried branch/trunk tip; not welded.
  * rocks: one convex-hull shell per rock (closed, broad facets).
"""
import bpy, bmesh, math, json, os, sys, random
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
BLEND_DIR = os.path.join(HERE, 'blend')
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')

# name: (sRGB hex, materialRole, roughness)
PALETTE = {
    'foliage_dark':  ('#6F8A3A', 'foliage', 0.92),
    'foliage_mid':   ('#8AA24A', 'foliage', 0.92),
    'foliage_light': ('#A9B35A', 'foliage', 0.90),
    'wood_trunk':    ('#5A4634', 'wood', 0.95),
    'stone_base':    ('#8C8276', 'stone', 0.96),
    'stone_top':     ('#B4A896', 'stone', 0.94),
}
TIER = {'dark': 'foliage_dark', 'mid': 'foliage_mid', 'light': 'foliage_light'}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def get_material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hexv, role, rough = PALETTE[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    lin = hex_linear(hexv)
    bsdf.inputs['Base Color'].default_value = (*lin, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = (*lin, 1.0)
    m['materialRole'] = role
    m['srgbHex'] = hexv
    return m


# ---------------------------------------------------------------- bmesh utils

def append_bm(dst, src, mat_index):
    vmap = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        nf = dst.faces.new([vmap[v] for v in f.verts])
        nf.material_index = mat_index


def cut_below(bm, z, scale):
    """Bisect at z, drop everything below, cap with a triangulated flat base."""
    eps = 0.04 * scale
    for v in bm.verts:   # snap near-plane verts so the cut does not leave slivers
        if abs(v.co.z - z) < eps:
            v.co.z = z
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, dist=1e-6)
    boundary = [e for e in bm.edges if e.is_boundary]
    res = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bmesh.ops.triangulate(bm, faces=res['faces'], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def lumpy_blob(center, radii, seed, subdiv=2, lump=0.055, under=0.84, cut_z=None):
    """Geodesic clump: low-frequency lumps (no per-face noise), flatter underside."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rot = Euler((rng.uniform(0, 6.283), rng.uniform(0, 6.283), rng.uniform(0, 6.283))).to_matrix()
    ph = [rng.uniform(0, 6.283) for _ in range(3)]
    for v in bm.verts:
        n = (rot @ v.co).normalized()
        f = 1 + lump * (math.sin(2.6 * n.x + ph[0]) + math.sin(2.6 * n.y + ph[1]) + math.sin(2.6 * n.z + ph[2])) / 3
        p = n * f
        if p.z < 0:
            p.z *= under
        v.co = Vector((p.x * radii[0] + center[0], p.y * radii[1] + center[1], p.z * radii[2] + center[2]))
    if cut_z is not None:
        cut_below(bm, cut_z, min(radii))
    return bm


def loft(rings, sides, seed=0):
    """rings: [(x, y, z, r)] -> capped tapered prism along a polyline."""
    rng = random.Random(seed)
    a0 = rng.uniform(0, 6.283)
    bm = bmesh.new()
    loops = []
    ref_u = None
    for i, (x, y, z, r) in enumerate(rings):
        c = Vector((x, y, z))
        d = (Vector(rings[i + 1][:3]) - c) if i < len(rings) - 1 else (c - Vector(rings[i - 1][:3]))
        d.normalize()
        if ref_u is None:
            ref_u = d.orthogonal().normalized()
        u = (ref_u - d * ref_u.dot(d)).normalized()   # stable ring orientation
        w = d.cross(u)
        loops.append([bm.verts.new(c + (u * math.cos(a0 + 2 * math.pi * k / sides) + w * math.sin(a0 + 2 * math.pi * k / sides)) * r)
                      for k in range(sides)])
    for a, b in zip(loops, loops[1:]):
        for k in range(sides):
            bm.faces.new([a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]])
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_to_object(bm, name, mat_names=()):
    me = bpy.data.meshes.new(name)
    for n in mat_names:   # slots must exist first, else to_mesh clamps material_index
        me.materials.append(get_material(n))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# --------------------------------------------------------------------- trees
# Fable contract review 2026-10-21: the three trees differ in silhouette, not
# only height. Clump: (x, y, z, rx, ry, rz, tier, seed). Blender X = GLB X
# (front), Blender Y = GLB Z (width). The first clump is the leader: the trunk
# tip is buried in it. Every other clump receives one branch.
# After building, the crown is re-centred on the trunk axis and scaled in XY to
# the declared crown width, and lifted so the top meets the declared height.
TREES = {
    'G16': dict(
        title='medium round broadleaf tree (4 clumps)', seed=16, height=5.4, width=3.8,
        trunk=[(0, 0, 0, 0.37), (0, 0, 0.25, 0.33), (0.02, 0, 1.4, 0.30), (0.04, 0.02, 2.5, 0.26)],
        blobs=[
            (0.0, 0.05, 4.25, 1.15, 1.10, 1.05, 'light', 11),
            (0.95, -0.55, 3.35, 0.95, 0.92, 0.88, 'mid', 12),
            (-0.05, 1.05, 3.40, 0.92, 0.90, 0.86, 'mid', 13),
            (-0.95, -0.55, 3.20, 0.90, 0.90, 0.84, 'dark', 14),
        ],
        # round 2: forks start lower so short branch segments read below the crown
        branch_from=[None, 1.95, 2.1, 1.9],
    ),
    'G17': dict(
        # round 2: round (not stretched) clumps, side clumps lower and overlapping
        # the leader ~30%, slight front/back offset so the crown is not a flat fan
        title='low wide-crown tree (3 clumps)', seed=17, height=4.8, width=4.4,
        trunk=[(0, 0, 0, 0.37), (0, 0, 0.25, 0.33), (-0.03, 0.02, 1.0, 0.30), (-0.05, 0.03, 1.8, 0.27)],
        blobs=[
            # round 3: side clumps pushed to front/back (+-0.62) and the leader made
            # mildly deeper so the side view is an umbrella (~3 m), not a 2.4 m fan
            (0.0, 0.0, 3.62, 1.42, 1.30, 1.02, 'mid', 21),
            (0.62, -1.38, 3.02, 1.02, 1.02, 0.86, 'dark', 22),
            (-0.60, 1.40, 3.08, 1.00, 1.00, 0.84, 'light', 23),
        ],
        branch_from=[None, 1.65, 1.75],
    ),
    'G18': dict(
        title='tall stacked tree (5 clumps)', seed=18, height=6.3, width=3.0,
        trunk=[(0, 0, 0, 0.37), (0, 0, 0.28, 0.33), (0.02, 0.0, 1.6, 0.29), (0.03, 0.03, 3.2, 0.24)],
        blobs=[
            (0.0, 0.0, 5.40, 0.80, 0.78, 0.82, 'light', 31),
            (0.55, 0.42, 4.40, 0.76, 0.74, 0.74, 'light', 32),
            (-0.55, -0.40, 4.30, 0.76, 0.74, 0.72, 'mid', 33),
            (0.50, -0.62, 3.25, 0.80, 0.78, 0.74, 'mid', 34),
            (-0.52, 0.62, 3.15, 0.80, 0.78, 0.72, 'dark', 35),
        ],
        branch_from=[None, 3.75, 3.65, 2.5, 2.4],
    ),
}

BUSHES = {
    'G19': dict(title='single-clump bush', blobs=[(0, 0, 0.42, 0.74, 0.68, 0.6, 'dark', 41)]),
    'G20': dict(title='double-clump bush', blobs=[
        (0.12, -0.38, 0.44, 0.72, 0.68, 0.6, 'dark', 51),
        (-0.05, 0.46, 0.3, 0.52, 0.5, 0.46, 'mid', 52),   # round 2: real overlap, round 1 barely touched
    ]),
}

# W along Blender Y (= GLB Z), D along Blender X (= GLB X), H up.
ROCKS = {
    # rings: (height fraction, points, radius fraction). Round 2: per-size recipe so
    # the trio is not three scaled copies - large is blocky with a broad shoulder,
    # small is rounder.
    'G21': dict(title='large rock', W=2.8, D=2.2, H=1.5, seed=2101, lean=(0.10, -0.06),
                rings=[(0.0, 7, 0.94), (0.34, 7, 1.0), (0.72, 6, 0.76), (0.93, 3, 0.40)]),
    'G22': dict(title='medium rock', W=1.6, D=1.3, H=0.85, seed=2201, lean=(-0.08, 0.07),
                rings=[(0.0, 7, 0.93), (0.30, 7, 1.0), (0.64, 6, 0.80), (0.88, 4, 0.47)]),
    'G23': dict(title='small rock', W=0.8, D=0.65, H=0.4, seed=2301, lean=(0.06, 0.08),
                rings=[(0.0, 6, 0.90), (0.28, 6, 1.0), (0.60, 6, 0.84), (0.86, 4, 0.52)]),
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def finish_object(ob, mat_names, aid, meta):
    me = ob.data
    assert [m.name for m in me.materials] == list(mat_names), (aid, [m.name for m in me.materials])
    for p in me.polygons:
        p.use_smooth = False   # deliberate faceted low-poly look
    ob['assetId'] = aid
    ob['materialRoles'] = json.dumps({n: PALETTE[n][1] for n in mat_names})
    for k, v in meta.items():
        ob[k] = v if isinstance(v, (int, float, str)) else json.dumps(v)
    return ob


def recenter(bm):
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    off = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
    for v in bm.verts:
        v.co -= off
    return off


def _crown_bm(blobs):
    mats = ['foliage_dark', 'foliage_mid', 'foliage_light']
    bm = bmesh.new()
    for x, y, z, rx, ry, rz, tier, seed in blobs:
        cb = lumpy_blob((x, y, z), (rx, ry, rz), seed)
        append_bm(bm, cb, mats.index(TIER[tier])); cb.free()
    return bm, mats


def _extent(bm):
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def fit_blobs(spec):
    """Re-centre crown on trunk axis, uniform XY scale to declared width, lift top to height.
    Linear in centres/radii, so the fitted crown is exactly the scaled crown."""
    blobs = spec['blobs']
    bm, _ = _crown_bm(blobs)
    (x0, x1), (y0, y1), (z0, z1) = _extent(bm); bm.free()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # Round 2: one uniform XY factor so clumps stay round; the widest crown axis
    # meets the declared crown width, the other axis keeps its designed depth.
    k = spec['width'] / max(x1 - x0, y1 - y0)
    dz = spec['height'] - z1
    return [((x - cx) * k, (y - cy) * k, z + dz, rx * k, ry * k, rz, t, sd) for x, y, z, rx, ry, rz, t, sd in blobs]


def build_tree(aid, spec):
    blobs = fit_blobs(spec)
    lead = blobs[0]
    # trunk tip buried 35% of the leader clump's vertical radius inside it
    trunk_rings = list(spec['trunk'])
    tx, ty = trunk_rings[-1][0], trunk_rings[-1][1]
    trunk_rings.append((tx * 0.5 + lead[0] * 0.5 * 0.2, ty * 0.5 + lead[1] * 0.5 * 0.2, lead[2] - 0.35 * lead[5], 0.17))
    trunk = bm_to_object(loft(trunk_rings, 8, seed=spec['seed']), aid + '_trunk_src')

    def axis_at(z):   # interpolate the trunk polyline at height z
        for (x0, y0, z0, _), (x1, y1, z1, _) in zip(trunk_rings, trunk_rings[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / (z1 - z0)
                return Vector((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z))
        return Vector(trunk_rings[-1][:3])

    branch_objs, ledger = [], []
    for i, (b, zf) in enumerate(zip(blobs, spec['branch_from'])):
        ledger.append(dict(center=[round(v, 3) for v in b[:3]], radii=[round(v, 3) for v in b[3:6]], tier=TIER[b[6]],
                           attach='trunk tip buried' if zf is None else f'branch from trunk z={zf}'))
        if zf is None:
            continue
        start = axis_at(zf)
        end = Vector(b[:3])
        d = end - start
        bury = start + d * (1 - 0.45 * min(b[3:6]) / d.length)   # tip buried inside clump
        mid = start + (bury - start) * 0.45 + Vector((0, 0, 0.16))
        rings = [(start.x, start.y, start.z, 0.15), (mid.x, mid.y, mid.z, 0.115), (bury.x, bury.y, bury.z, 0.08)]
        branch_objs.append(bm_to_object(loft(rings, 6, seed=spec['seed'] * 10 + i), f'{aid}_branch{i}'))
    # Wood = trunk + branches, Exact Boolean union -> one continuous surface.
    for bo in branch_objs:
        mod = trunk.modifiers.new(bo.name, 'BOOLEAN')
        mod.operation = 'UNION'; mod.solver = 'EXACT'; mod.object = bo
    dg = bpy.context.evaluated_depsgraph_get()
    wood_me = bpy.data.meshes.new_from_object(trunk.evaluated_get(dg))
    for bo in branch_objs:
        bpy.data.objects.remove(bo)
    bpy.data.objects.remove(trunk)
    wood_bm = bmesh.new(); wood_bm.from_mesh(wood_me); bpy.data.meshes.remove(wood_me)
    for f in wood_bm.faces:
        f.material_index = 0
    bmesh.ops.triangulate(wood_bm, faces=wood_bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')

    crown_bm, cmats = _crown_bm(blobs)
    used = sorted({f.material_index for f in crown_bm.faces})
    remap = {old: new for new, old in enumerate(used)}
    for f in crown_bm.faces:
        f.material_index = remap[f.material_index]
    crown_mats = [cmats[i] for i in used]

    # Joint bounds: XY centre -> 0, min Z -> 0 (applied to both meshes alike).
    ex_w, ex_c = _extent(wood_bm), _extent(crown_bm)
    off = Vector(((min(ex_w[0][0], ex_c[0][0]) + max(ex_w[0][1], ex_c[0][1])) / 2,
                  (min(ex_w[1][0], ex_c[1][0]) + max(ex_w[1][1], ex_c[1][1])) / 2,
                  min(ex_w[2][0], ex_c[2][0])))
    for bmx in (wood_bm, crown_bm):
        for v in bmx.verts:
            v.co -= off

    root = bpy.data.objects.new(aid, None)
    bpy.context.scene.collection.objects.link(root)
    t_ob = bm_to_object(wood_bm, 'trunk', ['wood_trunk'])
    c_ob = bm_to_object(crown_bm, 'crown', crown_mats)
    t_ob.data.name = aid + '_trunk'; c_ob.data.name = aid + '_crown'
    finish_object(t_ob, ['wood_trunk'], aid, dict(semantic='trunk', note='trunk+branches; static collider stays the 0.7x2.8 placeholder'))
    finish_object(c_ob, crown_mats, aid, dict(semantic='crown', clumps=ledger))
    for o in (t_ob, c_ob):
        o.parent = root
    root['assetId'] = aid
    root['title'] = spec['title']
    root['kind'] = 'tree'
    root['trunkAxisXY_blender'] = json.dumps([round(-off.x, 4), round(-off.y, 4)])
    root['clumpCount'] = len(blobs)
    return root


def build_bush(aid, spec):
    mats = []
    bm = bmesh.new()
    for x, y, z, rx, ry, rz, tier, seed in spec['blobs']:
        name = TIER[tier]
        if name not in mats:
            mats.append(name)
        cb = lumpy_blob((x, y, z), (rx, ry, rz), seed, lump=0.06, cut_z=0.0)
        append_bm(bm, cb, mats.index(name)); cb.free()
    recenter(bm)
    ob = bm_to_object(bm, aid, mats)
    return finish_object(ob, mats, aid, dict(title=spec['title'], kind='bush', clumps=len(spec['blobs'])))


def rock_points(rng, W, D, H, lean, rings):
    pts = []
    for t, n, rs in rings:
        a0 = rng.uniform(0, 6.283)
        for k in range(n):
            a = a0 + 2 * math.pi * k / n + rng.uniform(-0.22, 0.22)
            r = rs * (1 + rng.uniform(-0.07, 0.07))
            z = 0.0 if t == 0 else t * H * (1 + rng.uniform(-0.05, 0.05))
            pts.append(Vector((math.cos(a) * D / 2 * r + lean[0] * D * t, math.sin(a) * W / 2 * r + lean[1] * W * t, z)))
    pts.append(Vector((lean[0] * D + rng.uniform(-0.05, 0.05) * D, lean[1] * W, H)))
    return pts


def rock_bm(spec, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    for p in rock_points(rng, spec['W'], spec['D'], spec['H'], spec['lean'], spec['rings']):
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # merge near-coplanar hull triangles into broad facets, then re-triangulate
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(5), use_dissolve_boundaries=False,
                             verts=bm.verts, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    sx = spec['D'] / (max(xs) - min(xs)); sy = spec['W'] / (max(ys) - min(ys)); sz = spec['H'] / (max(zs) - min(zs))
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    recenter(bm)
    bm.normal_update()
    return bm


def tri_quality(bm):
    q = []
    for f in bm.faces:
        p, r, s = [v.co for v in f.verts[:3]]
        area = (r - p).cross(s - p).length / 2
        den = (r - p).length_squared + (s - r).length_squared + (p - s).length_squared
        q.append(4 * math.sqrt(3) * area / den if den else 0)
    return min(q)


def build_rock(aid, spec):
    # Deterministic seed search: keep the candidate with the best worst-triangle shape.
    best = None
    for s in range(spec['seed'], spec['seed'] + 40):
        bm = rock_bm(spec, s)
        q = tri_quality(bm)
        if best is None or q > best[0]:
            if best:
                best[2].free()
            best = (q, s, bm)
        else:
            bm.free()
    q, seed, bm = best
    for f in bm.faces:
        f.material_index = 1 if f.normal.z > 0.62 else 0   # sun-facing cap reads warm
    ob = bm_to_object(bm, aid, ['stone_base', 'stone_top'])
    return finish_object(ob, ['stone_base', 'stone_top'], aid,
                         dict(title=spec['title'], kind='rock', seed=seed, minTriangleQuality=round(q, 4)))


def export(ob, aid):
    os.makedirs(BLEND_DIR, exist_ok=True); os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [ob] + list(ob.children):
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.context.preferences.filepaths.save_version = 0   # session-only (factory startup); no .blend1
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, aid + '.blend'))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(GLB_DIR, aid + '.glb'), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_normals=True, export_materials='EXPORT',
        export_extras=True, export_texcoords=False, export_tangents=False, export_vertex_color='NONE',
        export_animations=False, export_cameras=False, export_lights=False, export_skins=False,
        export_morph=False, export_image_format='NONE',
        # Draco (added to the export contract 2026-10-21). 20-bit positions keep
        # bounds within ~1e-5 m; flat normals 10 bits; no UVs/colours exported.
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=20, export_draco_normal_quantization=10,
        export_draco_generic_quantization=12)


def main(ids):
    for aid in ids:
        clear_scene()
        if aid in TREES:
            ob = build_tree(aid, TREES[aid])
        elif aid in BUSHES:
            ob = build_bush(aid, BUSHES[aid])
        else:
            ob = build_rock(aid, ROCKS[aid])
        export(ob, aid)
        print('BUILT', aid, [o.name for o in [ob] + list(ob.children)])


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(argv or ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23'])
