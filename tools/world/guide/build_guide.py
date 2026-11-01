"""G24 guide (helmet + visor) L1 candidate: mesh, 18-bone rig, procedural weights, clips, export.

Run: Blender -b --factory-startup --python-exit-code 1 -P build_guide.py
Blender: Z-up, front +X, character right = -Y. glTF after the exporter's single Y-up
conversion: +X front, +Y up, +Z right. Feet sole at z=0, root at origin.
Clips are authored by this script (analytic leg IK baked to per-frame deform-bone keys);
they are NOT Mixamo and not an animator-facing control rig.
"""
import bpy, bmesh, json, math, os, sys, hashlib
from mathutils import Vector, Matrix, Quaternion

# Repo root derived from this file (tools/world/guide/build_guide.py), so a worktree build never writes into
# another checkout. G24_REPO overrides it explicitly.
REPO = os.environ.get('G24_REPO') or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
TOOLS = f'{REPO}/tools/world/guide'
PUBLIC = f'{REPO}/public/assets/world/guide'
DOCS = f'{REPO}/docs/world/character'
USE_MOCAP = os.environ.get('G24_MOCAP', '1') != '0'   # v3: Walk/Run/Sprint retargeted from CMU mocap
FPS = 60  # r2: 60 keys/s; at 30 the fast Run foot dipped 1 cm below ground between keys (linear/slerp)
RIGHT = -1.0  # Blender -Y is the character's right (glTF +Z). Bag + cyan dot go here (text lock).

PALETTE = {  # key: (name, hex, materialRole, roughness)
    'jacket': ('guide_jacket_paint', '#4E647D', 'paint', 0.85),
    'sleeve': ('guide_sleeve_cream', '#E6DCCB', 'canvas', 0.9),
    'pants': ('guide_pants_accent', '#3A3F47', 'accent', 0.92),
    'glove': ('guide_glove_boot_accent', '#4E647D', 'accent', 0.8),
    'bag': ('guide_hipbag_accent', '#E8803A', 'accent', 0.85),
    'helmet': ('guide_helmet_metal', '#E6DCCB', 'metal', 0.55),
    'visor': ('guide_visor_glass', '#4E647D', 'glass', 0.35),
    'dot': ('guide_dot_light', '#4FD1C5', 'light', 0.5),
}


def lin(h):
    h = h.lstrip('#')
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(f(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def material(key):
    name, hx, role, rough = PALETTE[key]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(hx)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0
    if key == 'dot':  # the single light-tech point; modest emission, runtime may scale it
        b.inputs['Emission Color'].default_value = lin(hx)
        b.inputs['Emission Strength'].default_value = 1.5
    m.diffuse_color = lin(hx)
    m['materialRole'] = role
    m['srgbHex'] = hx
    return m


# ------------------------------------------------------------------ skeleton (rest, A-pose)
ANKLE_Z = 0.095
HIP_Z = 0.67
HIP_Y = 0.10
LEG_LEN = 0.29 + 0.285   # thigh (0.67->0.38) + shin (0.38->0.095) lengths, hip-to-ankle (measured on the rig)
# r4 (intersection fix): shoulder joints 2.5 cm wider. At 0.185 the A-pose upper-arm root folded
# into the chest skin under each armpit: 16 nonadjacent triangle intersections even at rest.
SH_Y, SH_Z = 0.21, 1.075
ARM_DOWN = math.radians(55)          # A-pose: upper arm 55 deg below horizontal
UA, FA, HA = 0.225, 0.205, 0.085     # upper arm, forearm, hand lengths
DIAGONAL_RULE = 'short'
BOOT_TOP = 0.232  # r4: boot shaft top (flat rim); trouser end must stay inside
BOOT_R = 0.095   # r5: octagon circumradius (inradius 0.0878); trouser end stays inside
TOE_C, TOE_S, TOE_BEVEL = (0.07, 0, 0.037), (0.15, 0.16, 0.094), 0.024   # r5: toe box (y set per side)
SOLE_H = 0.018
HEM_Z = 0.66   # r5: jacket hem height; level cut line just above the crotch (lock: hem at the hip line)
HEM_SNAP = 0.008
HELMET_C, HELMET_R = 1.425, 0.295   # r2: lower + slightly larger, closes the r1 neck gap
HELMET_SEG, HELMET_RINGS = 32, 20   # v3: smooth round helmet (was 20 x 12, flat)


def arm_points(side):
    d = Vector((0, side * math.cos(ARM_DOWN), -math.sin(ARM_DOWN)))
    s = Vector((0, side * SH_Y, SH_Z))
    # r2: straight rest arm. A 1.2 cm backward elbow offset made the Skin modifier fold one shoulder
    # (16 non-manifold edges); the elbow hinge axis is defined explicitly in solve_pose instead.
    e = s + d * UA
    w = e + d * FA
    h = w + d * HA
    return s, e, w, h


def leg_points(side):
    hip = Vector((0, side * HIP_Y, HIP_Z))
    knee = Vector((0.012, side * HIP_Y, HIP_Z - 0.29))
    ankle = Vector((0, side * HIP_Y, ANKLE_Z))
    toe = Vector((0.13, side * HIP_Y, 0.03))
    return hip, knee, ankle, toe


def bone_table():
    T = {'root': (Vector((0, 0, 0)), Vector((0.25, 0, 0)), None, False),
         'pelvis': (Vector((0, 0, 0.63)), Vector((0, 0, 0.76)), 'root', True),
         'spine': (Vector((0, 0, 0.76)), Vector((0, 0, 0.92)), 'pelvis', True),
         'chest': (Vector((0, 0, 0.92)), Vector((0, 0, 1.10)), 'spine', True),
         'neck': (Vector((0, 0, 1.10)), Vector((0, 0, 1.20)), 'chest', True),
         'head': (Vector((0, 0, 1.20)), Vector((0, 0, 1.52)), 'neck', True)}
    for side, tag in ((-1, 'R'), (1, 'L')):
        s, e, w, h = arm_points(side)
        T[f'upperarm.{tag}'] = (s, e, 'chest', True)
        T[f'forearm.{tag}'] = (e, w, f'upperarm.{tag}', True)
        T[f'hand.{tag}'] = (w, h, f'forearm.{tag}', True)
        hip, knee, ankle, toe = leg_points(side)
        T[f'thigh.{tag}'] = (hip, knee, 'pelvis', True)
        T[f'shin.{tag}'] = (knee, ankle, f'thigh.{tag}', True)
        T[f'foot.{tag}'] = (ankle, toe, f'shin.{tag}', True)
    return T


BONES = bone_table()


# ------------------------------------------------------------------ mesh helpers
def new_obj(name, me):
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for o2 in bpy.context.scene.objects:
        o2.select_set(o2 == o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def skin_object(name, verts, edges, radii, root=0, subsurf=1, sym=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    o = new_obj(name, me)
    mod = o.modifiers.new('skin', 'SKIN')
    mod.branch_smoothing = 0.6
    mod.use_y_symmetry = sym
    for i, r in enumerate(radii):
        rr = r if isinstance(r, tuple) else (r, r)
        me.skin_vertices[''].data[i].radius = rr
        me.skin_vertices[''].data[i].use_root = (i == root)
    if subsurf:
        s = o.modifiers.new('sub', 'SUBSURF')
        s.levels = subsurf
        s.render_levels = subsurf
    apply_mods(o)
    return o


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


DEFORM_BODY = ['pelvis', 'spine', 'chest', 'neck'] + [f'{b}.{s}' for s in 'RL' for b in
                                                       ('upperarm', 'forearm', 'hand', 'thigh', 'shin')]


def nearest_bone(p, names=DEFORM_BODY):
    best = None
    for n in names:
        a, b, _, _ = BONES[n]
        d, t = seg_dist(p, a, b)
        if best is None or d < best[0]:
            best = (d, n, t)
    return best


# ------------------------------------------------------------------ body (continuous skin)
def build_body():
    V, E, R = [], [], []

    def add(p, r, parent=None):
        V.append(Vector(p))
        R.append(r)
        i = len(V) - 1
        if parent is not None:
            E.append((parent, i))
        return i

    p0 = add((0, 0, 0.665), 0.205)          # crotch / pelvis centre (root)
    p1 = add((0, 0, 0.80), 0.215, p0)
    p2 = add((0, 0, 0.95), 0.245, p1)
    p3 = add((0, 0, 1.06), 0.215, p2)        # shoulder line
    p4 = add((0, 0, 1.15), 0.115, p3)        # r2: dark collar, as wide as the helmet opening
    add((0, 0, 1.24), 0.105, p4)             # collar top, tucked inside the helmet
    for side in (-1, 1):
        s, e, w, h = arm_points(side)
        a0 = add(s + Vector((0, -side * 0.0, 0)), 0.088, p3)
        a1 = add(e, 0.07, a0)
        # r2: the sleeve ends in a closed cuff at the wrist. The skin modifier folded the mitten/thumb
        # junction (14 boundary + 16 non-manifold edges), so mittens are rigid glove parts.
        add(w + (w - e).normalized() * 0.01, 0.06, a1)
        hip, knee, ankle, _ = leg_points(side)
        l0 = add(hip + Vector((0, side * 0.005, -0.02)), 0.11, p0)
        l1 = add(knee, 0.085, l0)   # r4: slimmer knee node, less skin to fold at 105 deg flex
        add(ankle + Vector((0, 0, 0.045)), 0.083, l1)   # trouser end sits inside the boot shaft
    o = skin_object('G24_body', V, E, R, root=p0, subsurf=1)
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    loose = [v for v in bm.verts if not v.link_faces]   # skin-modifier remnants, no faces
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    # Shape pass on the applied mesh: flatter torso, slight chest/shoulder breadth, hem flare.
    for v in me.vertices:
        p = v.co
        d, n, t = nearest_bone(p)
        if n in ('pelvis', 'spine', 'chest'):
            p.x *= 0.74
            if p.z > 0.9:
                p.x += 0.012
            if 0.64 < p.z < 0.74:                # jacket hem flare (kept: removing it re-opened a Run hip fold)
                k = 1.0 + 0.05 * (1 - abs(p.z - 0.69) / 0.05)
                p.x *= k
                p.y *= k
        elif n == 'neck':
            p.x *= 0.92
    me.update()
    # r5 (A2): straight hem. A horizontal cut at HEM_Z through the torso/hip band, so the jacket/pants
    # material edge is a level line (r4 followed the existing edges: a zigzag reading as a V). Vertices
    # within HEM_SNAP of the plane count as on it (no sliver triangles); weights are computed per vertex
    # later, so the new loop is skinned like its neighbours.
    bm = bmesh.new()
    bm.from_mesh(me)
    band = [f for f in bm.faces if abs(f.calc_center_median().z - HEM_Z) < 0.07
            and nearest_bone(f.calc_center_median())[1] in ('pelvis', 'spine', 'thigh.R', 'thigh.L')]
    bmesh.ops.bisect_plane(bm, geom=list({v for f in band for v in f.verts}) + list({e for f in band for e in f.edges}) + band,
                           plane_co=(0, 0, HEM_Z), plane_no=(0, 0, 1), dist=HEM_SNAP)
    bm.to_mesh(me)
    bm.free()
    me.update()
    # r4 (A6): fix the body triangulation in the source and make it exactly left/right symmetric.
    # glTF stores the triangles chosen at export while Blender re-splits quads by their deformed
    # shape, so native and GLB folded differently; and FIXED/ALTERNATE splits were not mirror
    # symmetric (372 of 1242 edges unmirrored) so the two hips folded differently. Each quad is cut
    # on the diagonal that matches its mirror twin; the -Y twin decides by DIAGONAL_RULE.
    me.update()
    idx = {(round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5)): v.index for v in me.vertices}
    mirror_of = lambda i: idx.get((round(me.vertices[i].co.x, 5), round(-me.vertices[i].co.y, 5), round(me.vertices[i].co.z, 5)))
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()

    def diag_ok(f):
        """True if f should be cut v0-v2 (else v1-v3)."""
        v = [x.index for x in f.verts]
        d02, d13 = (f.verts[0].co - f.verts[2].co).length, (f.verts[1].co - f.verts[3].co).length
        return d02 <= d13 if DIAGONAL_RULE == 'short' else d02 > d13

    quads = [f for f in bm.faces if len(f.verts) == 4]
    choice = {}
    for f in quads:
        c = f.calc_center_median()
        key = frozenset(x.index for x in f.verts)
        if c.y < -1e-6 or abs(c.y) <= 1e-6:
            choice[key] = (f.verts[0].index, f.verts[2].index) if diag_ok(f) else (f.verts[1].index, f.verts[3].index)
    for f in quads:
        key = frozenset(x.index for x in f.verts)
        if key in choice:
            continue
        twin = frozenset(mirror_of(i) for i in key)
        if twin in choice and None not in twin:
            a, b = choice[twin]
            choice[key] = (mirror_of(a), mirror_of(b))
        else:
            choice[key] = (f.verts[0].index, f.verts[2].index) if diag_ok(f) else (f.verts[1].index, f.verts[3].index)
    for f in quads:
        a, b = choice[frozenset(x.index for x in f.verts)]
        bmesh.ops.connect_verts(bm, verts=[bm.verts[a], bm.verts[b]])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()
    # r4 (A2): the hem is a horizontal material line at HEM_Z (r3 split by nearest bone, which drew a V).
    # A geometric hem lip and an extra hem edge loop were both tried and dropped: each changed the hip
    # triangulation and folded into the thigh at Run/Jump hip flexion (A6 self-intersection).
    # materials by nearest bone at face centre
    keys = ['jacket', 'sleeve', 'pants', 'glove']
    for k in keys:
        me.materials.append(material(k))
    for f in me.polygons:
        c = f.center
        _, n, t = nearest_bone(c)
        if n.startswith('hand'):
            k = 'glove'
        elif n.startswith(('upperarm', 'forearm')):
            k = 'sleeve'
        elif n.startswith(('thigh', 'shin')):
            k = 'pants'
        elif n == 'neck' or c.z > 1.115:
            k = 'pants'                          # dark collar / neck under the helmet
        else:
            k = 'jacket' if c.z > HEM_Z else 'pants'
        if k == 'pants' and n.startswith('thigh') and c.z > HEM_Z:
            k = 'jacket'                         # r4: hem runs straight across the outer hip, not a V
        f.material_index = keys.index(k)
    return o


# ------------------------------------------------------------------ rigid parts
def build_boot(side):
    y = side * HIP_Y
    # r5 (A2): low-poly boot as in the lock (round3 guide-ortho): an octagonal shaft with a flat rim and
    # a lower, chamfered toe box, boolean-unioned (EXACT) into ONE closed shell; flat sole; dark sole band.
    # The r4 skin-modifier boot read as a rounded lump.
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=BOOT_R, radius2=BOOT_R,
                          depth=BOOT_TOP + 0.03)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 8, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-0.008, y, (BOOT_TOP + 0.03) / 2 - 0.01))
    me = bpy.data.meshes.new(f'G24_boot.{"R" if side < 0 else "L"}')
    bm.to_mesh(me)
    bm.free()
    o = new_obj(me.name, me)
    toe = rounded_box('G24_boot_toe_tmp', TOE_C, TOE_S, TOE_BEVEL, 'glove')
    toe.location.y = y
    mod = o.modifiers.new('union', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'UNION', 'EXACT', toe
    apply_mods(o)
    bpy.data.objects.remove(toe)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for co, nrm in (((0, 0, 0), (0, 0, 1)), ((0, 0, BOOT_TOP), (0, 0, -1))):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co,
                               plane_no=nrm, clear_inner=True)
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, SOLE_H), plane_no=(0, 0, 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(material('glove'))
    o.data.materials.append(material('pants'))
    for f in o.data.polygons:                # dark sole band (existing palette colour, same shell)
        f.material_index = 1 if f.center.z < SOLE_H else 0
    return o


def build_mitten(side):
    s, e, w, h = arm_points(side)
    d = (h - w).normalized()
    fwd = Vector((1, 0, 0))
    # final: glove root buried ~5 cm inside the sleeve (QA found the r3 root only touching the rounded
    # cuff end, 0.77 mm outside the shell, which rendered as a visible wrist gap).
    # (a mid-node variant broke the skin modifier: 28 boundary / 32 non-manifold edges; single root kept)
    V = [w - d * 0.05, w + d * 0.045, h + d * 0.005, w + d * 0.03 + fwd * 0.06]
    E = [(0, 1), (1, 2), (1, 3)]
    R = [0.04, 0.068, 0.05, 0.03]
    o = skin_object(f'G24_mitten.{"R" if side < 0 else "L"}', V, E, R, root=0, subsurf=1, sym=False)
    for v in o.data.vertices:        # mitten is flatter across the palm than front-to-back
        r = v.co - w
        lat = Vector((0, 1 if side > 0 else -1, 0))
        r -= lat * (r.dot(lat) * 0.18)
        v.co = w + r
    o.data.materials.append(material('glove'))
    return o


def build_helmet():
    bm = bmesh.new()
    # v3 (spec 5): 32 segments round the equator, 20 rings pole-to-pole (>= 12 above the equator
    # band after the neck cut); the shell is smooth-shaded in bind(), its cut rim stays a hard edge.
    bmesh.ops.create_uvsphere(bm, u_segments=HELMET_SEG, v_segments=HELMET_RINGS, radius=HELMET_R)
    for v in bm.verts:
        v.co.z *= 0.96
        v.co.x *= 1.0
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, -0.215),
                           plane_no=(0, 0, -1), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, HELMET_C))
    me = bpy.data.meshes.new('G24_helmet')
    bm.to_mesh(me)
    bm.free()
    o = new_obj('G24_helmet', me)
    me.materials.append(material('helmet'))
    return o


def shell_patch(name, az0, az1, el0, el1, r_in, r_out, naz, nel, key, centre):
    """Closed curved slab on a sphere around +X (az about Z from +X, el from equator)."""
    bm = bmesh.new()
    grid = {}
    for layer, r in ((0, r_in), (1, r_out)):
        for i in range(naz + 1):
            for j in range(nel + 1):
                az = az0 + (az1 - az0) * i / naz
                el = el0 + (el1 - el0) * j / nel
                p = Vector((r * math.cos(el) * math.cos(az), r * math.cos(el) * math.sin(az), r * math.sin(el) * 0.96))
                grid[layer, i, j] = bm.verts.new(p + centre)
    F = []
    for i in range(naz):
        for j in range(nel):
            F.append([grid[1, i, j], grid[1, i + 1, j], grid[1, i + 1, j + 1], grid[1, i, j + 1]])
            F.append([grid[0, i, j + 1], grid[0, i + 1, j + 1], grid[0, i + 1, j], grid[0, i, j]])
    for i in range(naz):
        F.append([grid[0, i, 0], grid[0, i + 1, 0], grid[1, i + 1, 0], grid[1, i, 0]])
        F.append([grid[1, i, nel], grid[1, i + 1, nel], grid[0, i + 1, nel], grid[0, i, nel]])
    for j in range(nel):
        F.append([grid[0, 0, j], grid[1, 0, j], grid[1, 0, j + 1], grid[0, 0, j + 1]])
        F.append([grid[0, naz, j + 1], grid[1, naz, j + 1], grid[1, naz, j], grid[0, naz, j]])
    for f in F:
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me)
    me.materials.append(material(key))
    return o


def rounded_box(name, centre, size, bevel, key, yaw=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES', profile=0.5)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=centre)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me)
    me.materials.append(material(key))
    return o


# ------------------------------------------------------------------ build all
def build_parts():
    parts = {}
    parts['body'] = build_body()
    parts['helmet'] = build_helmet()
    c = Vector((0, 0, HELMET_C))
    parts['visor'] = shell_patch('G24_visor', math.radians(-74), math.radians(74), math.radians(-14), math.radians(13),
                                 HELMET_R - 0.02, HELMET_R + 0.016, 32, 4, 'visor', c)   # v3: 32 x 4 segments, outer/inner faces smooth-shaded in bind()
    az = math.radians(-82) if RIGHT < 0 else math.radians(82)
    parts['dot'] = shell_patch('G24_dot', az - math.radians(5), az + math.radians(5), math.radians(-5), math.radians(5),
                               HELMET_R - 0.01, HELMET_R + 0.03, 2, 2, 'dot', c)
    parts['boot.R'] = build_boot(-1)
    parts['boot.L'] = build_boot(1)
    parts['mitten.R'] = build_mitten(-1)
    parts['mitten.L'] = build_mitten(1)
    # hip bag on the right hip, slightly forward so the hanging hand clears it; flap on top
    # r2: bag hangs on the belt line (z 0.72), outside the right thigh's swing volume; r1/r2a sat on
    # the hip joint and the swinging thigh passed through it.
    ang = math.radians(-38)           # r2: rear quarter of the right hip; the hanging arm passes in front
    nrm = Vector((math.sin(ang), RIGHT * math.cos(ang), 0))
    yaw = math.atan2(nrm.y, nrm.x) - math.atan2(RIGHT, 0)
    c = nrm * 0.205 + Vector((0, 0, 0.765))   # r3: on the jacket hem, above the thigh's swing (r2 clipped it)
    parts['bag'] = rounded_box('G24_bag', c, (0.14, 0.075, 0.115), 0.018, 'bag', yaw)
    # r4 (A6 relation table): the flap back sat 3.5 mm proud of the bag back and only grazed the jacket
    # (triangle crossings with ~0 mm interpenetration). Its back now sits 4 mm deeper than the bag's,
    # front face unchanged (c + 0.046 along nrm).
    parts['bagflap'] = rounded_box('G24_bagflap', c + nrm * 0.00225 + Vector((0, 0, 0.036)), (0.148, 0.0875, 0.048), 0.012, 'bag', yaw)
    # r2: zip sits on the measured chest surface (r1 floated in front of it)
    body = parts['body'].data.vertices
    front = max(v.co.x for v in body if 0.82 < v.co.z < 1.0 and abs(v.co.y) < 0.03)
    parts['zip'] = rounded_box('G24_zip', (front - 0.006, 0, 0.88), (0.022, 0.02, 0.34), 0.005, 'pants')
    return parts


RIGID = {'mitten.R': 'hand.R', 'mitten.L': 'hand.L', 'helmet': 'head', 'visor': 'head', 'dot': 'head', 'boot.R': 'foot.R', 'boot.L': 'foot.L',
         'bag': 'pelvis', 'bagflap': 'pelvis', 'zip': 'chest'}
# r3: wider elbow/knee blends; r2 folded skin inside the elbow and behind the knee at deep run flex
BLEND_W = {'pelvis': 0.07, 'spine': 0.07, 'chest': 0.07, 'neck': 0.035,
           'upperarm': 0.065, 'forearm': 0.07, 'hand': 0.03, 'thigh': 0.12, 'shin': 0.12}  # r4: wider hip/knee blends (Run hip crease + knee-pit folds)


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def body_weights(p):
    """Nearest deform bone with smooth blending only across that bone's own joints."""
    d, n, t = nearest_bone(p)
    if n.startswith('upperarm') and p.z < 0.95 and abs(p.y) < 0.185:
        # r4: flank skin below the armpit was nearest the A-pose upper arm and swung into the chest
        # during the Run back-swing (A6); it now follows the torso.
        d, n, t = nearest_bone(p, [x for x in DEFORM_BODY if not x.startswith(('upperarm', 'forearm', 'hand'))])
    if n.startswith(('thigh', 'pelvis')) and abs(p.y) < 0.05 and 0.50 < p.z < 0.62:
        # r4: crotch midline. These vertices had full thigh weight and swept through the opposite
        # side of the crotch at Run/Jump hip flexion (A6 self-intersection); the pelvis now carries
        # most of the midline strip, fading to the thigh at |y| = 5 cm.
        tag = 'L' if p.y > 0 else 'R'
        k = 0.6 * (1 - smooth(abs(p.y) / 0.05))
        w = {'pelvis': k, f'thigh.{tag}': 1 - k} if n.startswith('thigh') else {'pelvis': 1.0}
        w = {kk: v for kk, v in w.items() if v > 1e-3}
        tot = sum(w.values())
        return {kk: v / tot for kk, v in w.items()}
    a, b, parent, _ = BONES[n]
    L = (b - a).length
    w = {n: 1.0}
    s = t * L
    base = n.split('.')[0]
    hw = BLEND_W[base]
    if parent in DEFORM_BODY and s < hw:            # towards parent joint
        k = 0.5 * (1 - smooth(s / hw))
        w = {n: 1 - k, parent: k}
    else:
        kids = [c for c, (ca, cb, cp, _) in BONES.items() if cp == n and c in DEFORM_BODY]
        if kids and (L - s) < BLEND_W[kids[0].split('.')[0]]:
            kid = min(kids, key=lambda c: (BONES[c][0] - p).length)
            hw2 = BLEND_W[kid.split('.')[0]]
            if (BONES[kid][0] - p).length < hw2 * 2.5:
                k = 0.5 * (1 - smooth((L - s) / hw2))
                w = {n: 1 - k, kid: k}
    if n.startswith('thigh') and p.z > 0.64:
        # r4 (A6): front/side hip skin above the crotch moves mostly with the pelvis (the jacket) and
        # only 20% with the swinging thigh; full thigh weight folded the crease at Run hip flexion.
        k = smooth((p.z - 0.64) / 0.06)
        th = 0.2 + 0.8 * (1 - k)
        w = {n: w.get(n, 0) * th, 'pelvis': w.get('pelvis', 0) * th + (1 - th)}
    tot = sum(w.values())
    w = {k: v / tot for k, v in w.items() if v / tot > 1e-3}
    tot = sum(w.values())
    return {k: v / tot for k, v in w.items()}   # r3: renormalise after the cut


def build_rig():
    arm = bpy.data.armatures.new('G24_rig')
    arm.display_type = 'STICK'
    ao = new_obj('G24', arm)
    bpy.context.view_layer.objects.active = ao
    for o in bpy.context.scene.objects:
        o.select_set(o == ao)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, (h, t, p, deform) in BONES.items():
        b = arm.edit_bones.new(n)
        b.head, b.tail = h, t
        b.use_deform = deform
        # roll: keep local X pointing to world +X-ish for limbs so bends are about local X
        b.align_roll(Vector((1, 0, 0)) if abs((t - h).normalized().x) < 0.9 else Vector((0, 0, 1)))
        eb[n] = b
    for n, (h, t, p, deform) in BONES.items():
        if p:
            eb[n].parent = eb[p]
            eb[n].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao


def bind(parts, ao):
    groups_all = [n for n, v in BONES.items() if v[3]]
    meshes = []
    for key, o in parts.items():
        for n in groups_all:
            o.vertex_groups.new(name=n)
        if key == 'body':
            for v in o.data.vertices:
                for n, w in body_weights(v.co).items():
                    o.vertex_groups[n].add([v.index], w, 'REPLACE')
        else:
            bone = RIGID[key]
            o.vertex_groups[bone].add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
        meshes.append(o)
    # one skinned mesh object: join (distinct shells kept; rigid parts are one-hot)
    bpy.context.view_layer.objects.active = parts['body']
    for o in bpy.context.scene.objects:
        o.select_set(o in meshes)
    bpy.ops.object.join()
    body = parts['body']
    body.name = 'G24_mesh'
    body.data.name = 'G24_mesh'
    for p in body.data.polygons:
        p.use_smooth = False
    # v3 (spec 5): smooth shading on the helmet shell only; the visor band, cyan dot and the cut rim
    # (neck opening cap) keep hard edges. Everything else stays flat low-poly.
    hel = [i for i, m in enumerate(body.data.materials) if m and m.name.startswith('guide_helmet')]
    vis = [i for i, m in enumerate(body.data.materials) if m and m.name.startswith('guide_visor')]
    hc = Vector((0, 0, HELMET_C))
    bm = bmesh.new(); bm.from_mesh(body.data)
    for f in bm.faces:
        if f.material_index in hel:
            f.smooth = abs(f.normal.z + 1.0) > 1e-3 or f.calc_center_median().z > HELMET_C - HELMET_R * 0.5
        elif f.material_index in vis:
            # v3: the visor's curved outer and inner surfaces are smooth; its top/bottom rims and end caps
            # (normals not radial) stay flat, so the band keeps crisp upper/lower edges
            radial = (f.calc_center_median() - hc).normalized()
            f.smooth = abs(f.normal.dot(radial)) > 0.9
    for e in bm.edges:
        fs = e.link_faces
        e.smooth = len(fs) == 2 and all(f.smooth for f in fs)
    bm.to_mesh(body.data); bm.free()
    body.parent = ao
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = ao
    mod.use_deform_preserve_volume = False
    return body


# ------------------------------------------------------------------ posing (world-delta -> local basis)
REST = {}


def cache_rest(ao):
    for b in ao.data.bones:
        REST[b.name] = dict(R=b.matrix_local.to_3x3().to_quaternion(), head=b.head_local.copy(),
                            tail=b.tail_local.copy(), parent=b.parent.name if b.parent else None)


Z = Vector((0, 0, 1))
YAX = Vector((0, 1, 0))
XAX = Vector((1, 0, 0))


def rot(axis, ang):
    return Quaternion(axis, ang)


def two_bone(h, target, l1, l2, pole):
    d_vec = target - h
    d = d_vec.length
    d_c = min(d, (l1 + l2) * 0.9995)
    u = d_vec.normalized()
    pp = pole - u * pole.dot(u)
    pp.normalize()
    ca = (l1 * l1 + d_c * d_c - l2 * l2) / (2 * l1 * d_c)
    ca = max(-1, min(1, ca))
    sa = math.sqrt(1 - ca * ca)
    knee = h + u * (l1 * ca) + pp * (l1 * sa)
    end = knee + (h + u * d_c - knee).normalized() * l2 if d > d_c else target
    return knee, end, d - d_c


def solve_pose(P):
    """P: pelvis_off, pelvis(q), spine(q rel), chest(q rel), head(q world), arms{side:(swing, adduct, flex, hand)},
    feet{side:(ankle Vector, foot q world)}. Returns {bone: (local_quat, local_loc)} and stretch."""
    D = {'root': Quaternion()}
    D['pelvis'] = P['pelvis']
    D['spine'] = D['pelvis'] @ P['spine']
    D['chest'] = D['spine'] @ P['chest']
    D['head'] = P['head']
    # neck halfway between chest and head
    D['neck'] = D['chest'].slerp(D['head'], 0.5)
    pel_head = REST['pelvis']['head'] + P['pelvis_off']

    def world_point(rest_pt, bone):  # rest point carried rigidly by bone delta about its posed head
        return HEADS[bone] + D[bone] @ (rest_pt - REST[bone]['head'])

    HEADS = {'pelvis': pel_head}
    HEADS['spine'] = world_point(REST['spine']['head'], 'pelvis')
    HEADS['chest'] = world_point(REST['chest']['head'], 'spine')
    HEADS['neck'] = world_point(REST['neck']['head'], 'chest')
    stretch = {}
    for side, tag in ((-1, 'R'), (1, 'L')):
        swing, adduct, flex, handq = P['arms'][tag]
        sgn = 1 if side < 0 else -1          # adduction rotates the arm toward the body
        qa = rot(YAX, -swing) @ rot(XAX, sgn * adduct)
        D[f'upperarm.{tag}'] = D['chest'] @ qa
        ad = (REST[f'upperarm.{tag}']['tail'] - REST[f'upperarm.{tag}']['head']).normalized()
        k = ad.cross(XAX).normalized()
        D[f'forearm.{tag}'] = D[f'upperarm.{tag}'] @ rot(k, flex)
        D[f'hand.{tag}'] = D[f'forearm.{tag}'] @ handq
        # legs
        HEADS[f'thigh.{tag}'] = world_point(REST[f'thigh.{tag}']['head'], 'pelvis')
        hip = HEADS[f'thigh.{tag}']
        ankle_t, footq = P['feet'][tag]
        l1 = (REST[f'thigh.{tag}']['tail'] - REST[f'thigh.{tag}']['head']).length
        l2 = (REST[f'shin.{tag}']['tail'] - REST[f'shin.{tag}']['head']).length
        fwd = D['pelvis'] @ XAX
        knee, ankle, over = two_bone(hip, ankle_t, l1, l2, fwd)
        stretch[tag] = over
        r_th = (REST[f'thigh.{tag}']['tail'] - REST[f'thigh.{tag}']['head']).normalized()
        q_th = (D['pelvis'] @ r_th).rotation_difference((knee - hip).normalized()) @ D['pelvis']
        D[f'thigh.{tag}'] = q_th
        r_sh = (REST[f'shin.{tag}']['tail'] - REST[f'shin.{tag}']['head']).normalized()
        D[f'shin.{tag}'] = (q_th @ r_sh).rotation_difference((ankle - knee).normalized()) @ q_th
        D[f'foot.{tag}'] = footq
    out = {}
    for n, r in REST.items():
        Rb = r['R']
        Dp = D[r['parent']] if r['parent'] else Quaternion()
        B = Rb.inverted() @ Dp.inverted() @ D[n] @ Rb
        loc = Vector((0, 0, 0))
        if n == 'pelvis':
            loc = Rb.inverted() @ P['pelvis_off']
        out[n] = (B, loc)
    return out, stretch


# ------------------------------------------------------------------ clips
BOOT = {}


def foot_q(yaw, pitch_toe_up):
    # rotation about +Y by +a tips +X (toe) down; toe-up therefore uses -pitch
    return rot(Z, yaw) @ rot(YAX, -pitch_toe_up)


def ankle_from_pivot(pivot_x, side, pivot, pitch_toe_up):
    """pivot: (x, z) of a real boot vertex in ankle-relative rest coords, kept on the ground at pivot_x."""
    rel = Vector((-pivot[0], 0, -pivot[1]))
    r = rot(YAX, -pitch_toe_up) @ rel
    return Vector((pivot_x, side * HIP_Y, 0)) + r


def boot_min_z(footq):
    return min((footq @ o).z for o in BOOT['offsets'])


def ground_clamp(ankle, footq, stance):
    """r2: keep every boot vertex at/above y=0; in stance the lowest one rests exactly on it."""
    low = ankle.z + boot_min_z(footq)
    if stance or low < 0:
        ankle = ankle.copy()
        ankle.z -= low
    return ankle


def hermite(p0, p1, m0, m1, s):
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1


def gait_foot(u, side, G):
    """In-place gait: stance foot slides back at G['v']; returns (ankle, footq, contact_flag)."""
    T, v, duty = G['T'], G['v'], G['duty']
    Ls = v * T * duty
    x_front = G['x0'] + Ls / 2
    ys = side * (HIP_Y + G.get('track', 0.0))

    def stance(us):           # us in [0,1] over stance
        F = x_front - Ls * us
        hs, to = G['heel_frac'], G['toe_frac']
        if us < hs and G['heel_pitch'] > 0:
            th = G['heel_pitch'] * (1 - smooth(us / hs))
            pv = BOOT['heel_pivot']
            return ground_clamp(ankle_from_pivot(F + pv[0], side, pv, th), foot_q(0, th), True), th
        if us > 1 - to:
            th = -G['toe_pitch'] * smooth((us - (1 - to)) / to)
            pv = BOOT['toe_pivot']
            return ground_clamp(ankle_from_pivot(F + pv[0], side, pv, th), foot_q(0, th), True), th
        return ground_clamp(Vector((F, side * HIP_Y, ANKLE_Z)), foot_q(0, 0), True), 0.0

    if u < duty:
        a, th = stance(u / duty)
        a.y = ys
        return a, foot_q(0, th), True
    s = (u - duty) / (1 - duty)
    a0, th0 = stance(1.0)
    a1, th1 = stance(0.0)
    Tsw = T * (1 - duty)
    x = hermite(a0.x, a1.x, -v * Tsw, -v * Tsw, s)
    zlin = a0.z + (a1.z - a0.z) * s
    z = a0.z + (a1.z - a0.z) * smooth(s) + G['clear'] * math.sin(math.pi * s) ** 2
    th = th0 + (th1 - th0) * smooth(s) + G.get('swing_toe_up', 0.0) * math.sin(math.pi * s) ** 2
    q = foot_q(0, th)
    return ground_clamp(Vector((x, ys, z)), q, False), q, False


def locomotion(t, G):
    T = G['T']
    uR = (t / T) % 1.0
    uL = (uR + 0.5) % 1.0
    feet = {}
    contact = {}
    for tag, side, u in (('R', -1, uR), ('L', 1, uL)):
        a, q, c = gait_foot(u, side, G)
        feet[tag] = (a, q)
        contact[tag] = c
    ph = 2 * math.pi * uR
    yaw = G['yaw'] * math.cos(ph)
    bob = G['bob'] * math.cos(2 * ph - G.get('bob_phase', 0.0) * 2 * math.pi)
    sway = -G['sway'] * math.sin(ph)
    z = G['pelvis_z'] + bob
    # keep each hip within reach of its ankle target (no IK overstretch)
    lmax = 0.575 * 0.997
    for tag, side in (('R', -1), ('L', 1)):
        a = feet[tag][0]
        hip = Vector((0, side * HIP_Y, 0))
        dx, dy = a.x - hip.x, a.y - (side * HIP_Y + sway)
        zmax = a.z + math.sqrt(max(lmax ** 2 - dx * dx - dy * dy, 0.01))
        z = min(z, zmax + (0.63 - HIP_Z) + (HIP_Z - 0.63))
    pel = rot(Z, yaw) @ rot(YAX, G['lean']) @ rot(XAX, G.get('roll', 0) * math.sin(ph))
    P = dict(pelvis_off=Vector((G.get('pelvis_x', 0.0), sway, z - HIP_Z)), pelvis=pel,
             spine=rot(Z, -yaw * 0.8) @ rot(YAX, G['lean_spine']),
             chest=rot(Z, -yaw * 0.6) @ rot(YAX, G.get('lean_chest', 0.0)),
             head=rot(YAX, G['head_pitch']) @ rot(Z, -yaw * 0.15),
             feet=feet, arms={})
    for tag, u, side in (('R', uR, -1), ('L', uL, 1)):
        sw = -G['arm'] * math.cos(2 * math.pi * (u - G.get('arm_lag', 0.04))) + G.get('arm_bias', 0.0)
        # r2: smooth elbow pulse (r1 used max(0, sin), a slope kink that made the hands snap)
        flex = G['elbow'] + G['elbow_amp'] * (0.5 + 0.5 * math.sin(2 * math.pi * (u - 0.5 - G.get('arm_lag', 0.04)))) ** 2
        P['arms'][tag] = (sw, G['adduct'], flex, rot(XAX, 0))
    return P, contact


# Short legs (hip 0.67 m): 1.5 m/s is a brisk walk for this body. T=0.6 s gives 3.3 steps/s and a
# 0.5 m stance travel that the 0.575 m leg reaches with a ~4 cm pelvis dip instead of overstretching.
WALK = dict(T=0.6, v=1.5, duty=0.56, x0=0.03, heel_frac=0.14, toe_frac=0.22, heel_pitch=math.radians(12),
            toe_pitch=math.radians(26), clear=0.075, swing_toe_up=math.radians(6), track=0.0,
            pelvis_z=0.64, bob=0.012, bob_phase=0.0, yaw=math.radians(5), sway=0.016, roll=math.radians(1.5),
            lean=math.radians(2), lean_spine=math.radians(2), head_pitch=math.radians(-2),
            arm=math.radians(22), arm_lag=0.04, elbow=math.radians(14), elbow_amp=math.radians(14),
            adduct=math.radians(9), arm_bias=math.radians(-2))   # r3: arm clears the hip bag on the back-swing
RUN = dict(T=0.4, v=4.2, duty=0.33, x0=0.06, heel_frac=0.0, toe_frac=0.35, heel_pitch=0.0,
           # r4 (A6): 3 cm less swing clearance, pelvis 1.5 cm higher, forward lean moved from the pelvis
           # to the spine. Same speed, cadence, stride and arm swing; reduces peak hip flexion, which
           # folded the front-thigh crease into itself.
           toe_pitch=math.radians(30), clear=0.13, swing_toe_up=math.radians(10), track=-0.01,
           pelvis_z=0.65, bob=0.02, bob_phase=0.0, yaw=math.radians(7), sway=0.012, roll=0.0,
           lean=math.radians(0), lean_spine=math.radians(12), head_pitch=math.radians(-9),
           arm=math.radians(42), arm_lag=0.03, elbow=math.radians(72), elbow_amp=math.radians(14),
           adduct=math.radians(7), arm_bias=math.radians(4))   # r3: run back-swing forearm clears the hip bag


def stand_feet(z_off=0.0):
    return {tag: (Vector((0.015, side * (HIP_Y + 0.008), ANKLE_Z + z_off)), foot_q(0, 0))
            for tag, side in (('R', -1), ('L', 1))}


def idle(t, period=2.4):
    ph = 2 * math.pi * t / period
    breathe = math.sin(ph)
    sway = 0.012 * math.sin(ph * 0.5)
    P = dict(pelvis_off=Vector((0.0, sway, -0.014 + 0.003 * breathe)), pelvis=rot(XAX, -0.012 * math.sin(ph * 0.5)),
             spine=rot(YAX, math.radians(1.0) * breathe), chest=rot(YAX, -math.radians(1.6) * breathe),
             head=rot(YAX, math.radians(-1.0) * breathe) @ rot(Z, math.radians(3) * math.sin(ph * 0.5)),
             feet=stand_feet(), arms={})
    for tag, s in (('R', 1), ('L', -1)):
        P['arms'][tag] = (math.radians(3) * math.sin(ph + s * 0.4), math.radians(18) + math.radians(1.5) * breathe,
                          math.radians(16), rot(XAX, 0))
    return P


def lerp_pose(A, B, s):
    """Blend two pose dicts (vectors lerp, quats slerp, arm tuples per element)."""
    out = {}
    for k in A:
        a, b = A[k], B[k]
        if isinstance(a, Vector):
            out[k] = a.lerp(b, s)
        elif isinstance(a, Quaternion):
            out[k] = a.slerp(b, s)
        elif k == 'arms':
            out[k] = {t: tuple((x.slerp(y, s) if isinstance(x, Quaternion) else x + (y - x) * s)
                               for x, y in zip(a[t], b[t])) for t in a}
        elif k == 'feet':
            out[k] = {t: (a[t][0].lerp(b[t][0], s), a[t][1].slerp(b[t][1], s)) for t in a}
    return out


def key_pose(pelvis_z, lean, feet, arms, head_pitch=0.0, spine=0.0, chest=0.0, roll=0.0):
    return dict(pelvis_off=Vector((0, 0, pelvis_z - HIP_Z)), pelvis=rot(YAX, lean) @ rot(XAX, roll),
                spine=rot(YAX, spine), chest=rot(YAX, chest), head=rot(YAX, head_pitch), feet=feet, arms=arms)


def arms_sym(swing, adduct, flex):
    return {'R': (swing, adduct, flex, rot(XAX, 0)), 'L': (swing, adduct, flex, rot(XAX, 0))}


R_ = math.radians
# Jump: physics launches on the key press, so the clip opens already extending (no wind-up),
# reaches a tucked air pose and holds its last frame while airborne.
J0 = key_pose(0.60, R_(10), stand_feet(), arms_sym(R_(-25), R_(4), R_(30)), R_(-4), R_(4), R_(2))  # r3: less adduction so the back-swing clears the bag
# r5: toe-off ankle 1 cm higher. The flat r5 toe box kept two sole vertices planted 4 frames longer,
# raising the take-off local slip from 35 to 75 mm; +1 cm returns it to the r4 level (still executed_fail).
J1 = key_pose(0.69, R_(3), {t: (Vector((0.0, s * (HIP_Y + 0.01), ANKLE_Z + 0.06)), foot_q(0, R_(-28)))
                            for t, s in (('R', -1), ('L', 1))}, arms_sym(R_(22), R_(12), R_(62)), R_(-6))   # r3: elbows lead, hands lower
J2 = key_pose(0.69, R_(4), {'R': (Vector((0.10, -HIP_Y - 0.02, 0.27)), foot_q(0, R_(-8))),
                            'L': (Vector((-0.06, HIP_Y + 0.02, 0.22)), foot_q(0, R_(-18)))},
              arms_sym(R_(30), R_(-6), R_(38)), R_(-4), R_(2), R_(2))
LAND_IMPACT = key_pose(0.555, R_(11), {t: (Vector((0.015, s * (HIP_Y + 0.008), ANKLE_Z)), foot_q(0, 0))
                                       for t, s in (('R', -1), ('L', 1))},
                       arms_sym(R_(18), R_(2), R_(34)), R_(-6), R_(5), R_(4))
LAND_REACH = key_pose(0.665, R_(4), {t: (Vector((0.015, s * (HIP_Y + 0.008), ANKLE_Z)), foot_q(0, 0))
                                     for t, s in (('R', -1), ('L', 1))}, arms_sym(R_(30), R_(-6), R_(38)), R_(-4))


def keyed(times, poses, t, planted_until=-1.0):
    P = None
    for i in range(len(times) - 1):
        if times[i] <= t <= times[i + 1]:
            s = (t - times[i]) / (times[i + 1] - times[i])
            P = lerp_pose(poses[i], poses[i + 1], smooth(s))
            break
    if P is None:
        P = poses[-1] if t > times[-1] else poses[0]
    P = dict(P)
    P['feet'] = {k: (ground_clamp(a, q, t <= planted_until), q) for k, (a, q) in P['feet'].items()}
    return P


CLIPS = {
    'Idle': dict(dur=2.4, loop=True, f=lambda t: (idle(t), {'R': True, 'L': True}), speed=0.0),
    'Walk': dict(dur=WALK['T'], loop=True, f=lambda t: locomotion(t, WALK), speed=WALK['v']),
    'Run': dict(dur=RUN['T'], loop=True, f=lambda t: locomotion(t, RUN), speed=RUN['v']),
    'Jump': dict(dur=0.5, loop=False, f=lambda t: (keyed([0, 0.13, 0.42], [J0, J1, J2], t, 0.0), {'R': t <= 0.0, 'L': t <= 0.0}),
                 speed=0.0),
    'Land': dict(dur=0.4, loop=False,
                 f=lambda t: (keyed([0, 0.09, 0.4], [LAND_REACH, LAND_IMPACT, idle(0)], t, 1.0), {'R': True, 'L': True}),
                 speed=0.0),
}


def solve_pose_world(P):
    """v3 mocap retarget: P has WORLD rotations for pelvis/spine/chest/head, arms{tag:(upper q, fore q)},
    feet{tag:(ankle target, foot q, knee pole)} and 'hip' = target hip-midpoint position."""
    D = {'root': Quaternion(), 'pelvis': P['pelvis'], 'spine': P['spine'], 'chest': P['chest'], 'head': P['head']}
    D['neck'] = D['chest'].slerp(D['head'], 0.5)
    hip_rest = Vector((0, 0, HIP_Z))
    pel_head = P['hip'] - D['pelvis'] @ (hip_rest - REST['pelvis']['head'])
    pelvis_off = pel_head - REST['pelvis']['head']
    HEADS = {'pelvis': pel_head}
    stretch = {}
    for tag in ('R', 'L'):
        D[f'upperarm.{tag}'], D[f'forearm.{tag}'] = P['arms'][tag]
        D[f'hand.{tag}'] = D[f'forearm.{tag}']
        hip = pel_head + D['pelvis'] @ (REST[f'thigh.{tag}']['head'] - REST['pelvis']['head'])
        ankle_t, footq, pole = P['feet'][tag]
        l1 = (REST[f'thigh.{tag}']['tail'] - REST[f'thigh.{tag}']['head']).length
        l2 = (REST[f'shin.{tag}']['tail'] - REST[f'shin.{tag}']['head']).length
        knee, ankle, over = two_bone(hip, ankle_t, l1, l2, pole)
        stretch[tag] = over
        r_th = (REST[f'thigh.{tag}']['tail'] - REST[f'thigh.{tag}']['head']).normalized()
        q_th = r_th.rotation_difference((knee - hip).normalized())
        D[f'thigh.{tag}'] = q_th
        r_sh = (REST[f'shin.{tag}']['tail'] - REST[f'shin.{tag}']['head']).normalized()
        D[f'shin.{tag}'] = (q_th @ r_sh).rotation_difference((ankle - knee).normalized()) @ q_th
        D[f'foot.{tag}'] = footq
    out = {}
    for n, r in REST.items():
        Rb = r['R']
        Dp = D[r['parent']] if r['parent'] else Quaternion()
        B = Rb.inverted() @ Dp.inverted() @ D[n] @ Rb
        loc = Rb.inverted() @ pelvis_off if n == 'pelvis' else Vector((0, 0, 0))
        out[n] = (B, loc)
    return out, stretch


MOCAP = {}   # name -> (frames [(local, contact)], report), filled in main() before baking


def bake_clips(ao):
    ao.animation_data_create()
    pbs = ao.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'
    report = {}
    clips = dict(CLIPS)
    if MOCAP:
        clips.pop('Jump', None); clips.pop('Land', None)   # v3: replaced by measured one-shots
    for name, (frames, mrep) in MOCAP.items():
        loop = 'kind' not in mrep
        n_ = len(frames) if loop else len(frames) - 1
        clips[name] = dict(dur=n_ / FPS, loop=loop, frames=frames, speed=mrep['design_speed_mps'])
    for name, C in clips.items():
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ao.animation_data.action = act
        n = int(round(C['dur'] * FPS))
        max_stretch = 0.0
        mask = {'R': [], 'L': []}
        for f in range(n + 1):
            t = f / FPS
            if C['loop']:
                t = t % C['dur'] if f < n else 0.0   # last key equals first: seamless loop
            if 'frames' in C:
                local, contact = C['frames'][f % len(C['frames'])]
                stretch = {'R': 0.0, 'L': 0.0}
            else:
                P, contact = C['f'](t)
                local, stretch = solve_pose(P)
            max_stretch = max(max_stretch, *stretch.values())
            for k in mask:
                mask[k].append(1 if contact[k] else 0)
            for pb in pbs:
                q, loc = local[pb.name]
                pb.rotation_quaternion = q
                pb.location = loc
                pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
                if pb.name == 'pelvis':
                    pb.keyframe_insert('location', frame=f, group=pb.name)
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        act['frames'] = n
        act['loop'] = C['loop']
        act['designSpeedMps'] = C['speed']
        act['contactR'] = mask['R']
        act['contactL'] = mask['L']
        if name in MOCAP and 'yaw_curve' in MOCAP[name][1]:
            act['yawCurve'] = MOCAP[name][1]['yaw_curve']
        act.frame_range = (0, n)
        report[name] = dict(frames=n, duration_s=n / FPS, loop=C['loop'], designSpeedMps=C['speed'],
                            ik_overstretch_max_m=max_stretch)
        if name in MOCAP:
            report[name]['mocap'] = MOCAP[name][1]
            report[name]['ik_overstretch_max_m'] = MOCAP[name][1]['ik_overstretch_max_m']
        ao.animation_data.action = None
        tr = ao.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        tr.mute = True
    for pb in pbs:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    return report


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.unit_settings.system = 'METRIC'
    parts = build_parts()
    # boot landmarks (rest): heel and ball points on the sole, foot-local x
    bo = parts['boot.R']
    ank = Vector((0, -HIP_Y, ANKLE_Z))
    BOOT['offsets'] = [v.co - ank for v in bo.data.vertices]
    # pivots = the boot vertex that is lowest when the foot is pitched to the gait's heel/toe extremes
    hp = min(BOOT['offsets'], key=lambda o: (foot_q(0, WALK['heel_pitch']) @ o).z)
    tp = min(BOOT['offsets'], key=lambda o: (foot_q(0, -WALK['toe_pitch']) @ o).z)
    BOOT['heel_pivot'] = (hp.x, hp.z)
    BOOT['toe_pivot'] = (tp.x, tp.z)
    BOOT['sole_x_range'] = (min(o.x for o in BOOT['offsets']), max(o.x for o in BOOT['offsets']))
    ao = build_rig()
    body = bind(parts, ao)
    cache_rest(ao)
    if USE_MOCAP:
        sys.path.insert(0, TOOLS)
        import mocap_retarget as MR
        data = MR.load()
        consts = dict(LEG=LEG_LEN, ANKLE_Z=ANKLE_Z, HIP_Y=HIP_Y, HIP_Z=HIP_Z)
        for nm in ('Walk', 'Run', 'Sprint'):
            MOCAP[nm] = MR.make_loop_clip(nm, data, REST, BOOT, consts, solve_pose_world, FPS)
        idle_local = solve_pose(idle(0.0))[0]
        for nm, val in MR.make_oneshot_clips(data, REST, BOOT, consts, solve_pose_world, idle_local, FPS).items():
            MOCAP[nm] = val
        # v3d: measured extra one-shots (sit / turn in place / idle look), same retarget + contact bake
        if os.path.exists(MR.EXTRA_SRC) and os.environ.get('G24_EXTRA', '1') != '0':
            for nm, val in MR.make_oneshot_clips(MR.load_extra(), REST, BOOT, consts, solve_pose_world, idle_local, FPS, MR.EXTRA).items():
                MOCAP[nm] = val
    rep = bake_clips(ao)
    sc.frame_start, sc.frame_end = 0, 72
    ao['assetId'] = 'G24'
    ao['front'] = '+X'
    ao['footContact'] = 'sole y=0'
    ao['source'] = 'L1 script-authored rig and clips (not Mixamo)'
    ao['clipDesignSpeedMps'] = json.dumps({k: v['designSpeedMps'] for k, v in rep.items()})
    ao['bootLandmarks'] = json.dumps({k: v for k, v in BOOT.items() if k != 'offsets'})
    os.makedirs(f'{TOOLS}/blend', exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{TOOLS}/blend/G24.blend', compress=False)
    with open(f'{TOOLS}/out/build_report.json', 'w') as fh:
        json.dump(dict(clips=rep, boot={k: v for k, v in BOOT.items() if k != 'offsets'}, bones=len(ao.data.bones),
                       deform_bones=sum(b.use_deform for b in ao.data.bones)), fh, indent=1)
    print('BUILD', json.dumps(rep))


if __name__ == '__main__':
    main()
