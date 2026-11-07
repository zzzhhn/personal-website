"""Generate named native workshop assemblies, material batches and a verified runtime GLB."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / 'public/assets/world/camp-workshop-craft'
PACK = PUBLIC / 'camp-workshop.glb'
STAGED_PACK = HERE / '.camp-workshop-export.glb'
NATIVE = HERE / 'workshop.blend'
EVIDENCE = HERE / 'evidence'
sys.path.insert(0, str(HERE))
from surfaces import make_maps, png

WALL_SHIFT = .12590023696422577
TOOL_PIVOT = Vector((.20590023696422577, 0, 1.0299999713897705))
FAMILIES = ('C08', 'C11')
BRANCHES = ('C08', 'C11_body', 'C11_tools')
ORM_SIZE = 32
ORM_TILE = 8
ORM_COLUMNS = ORM_SIZE // ORM_TILE
CLOTH_KEYS = ('slate linen', 'olive linen', 'rust linen')
FLAT_BODY_KEYS = ('dark timber', 'dark steel', 'steel', 'paper')
NO_SHADOW_KEYS = ('warm brass', 'shadow')
FLAT_TOOL_KEYS = ('dark steel', 'steel', 'rubber', 'orange grip')
BATCH_COUNTS = {'C08': 7, 'C11_body': 5, 'C11_tools': 3}


def load_json(path):
    raw = path.read_bytes()
    return json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def srgb(channel):
    channel /= 255
    return channel / 12.92 if channel < .04045 else ((channel + .055) / 1.055) ** 2.4


def material(name, color, rough, metal=0, image=None, normal=None):
    mat = bpy.data.materials.new('Workshop | ' + name)
    mat.use_nodes = True
    mat.diffuse_color = color = (*[srgb(int(color[i:i+2], 16)) for i in (0, 2, 4)], 1)
    mat.roughness, mat.metallic = rough, metal
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if image or normal:
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
    if image:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = images[image]
        links.new(uv.outputs['UV'], tex.inputs['Vector'])
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = images[normal]
        links.new(uv.outputs['UV'], tex.inputs['Vector'])
        bump = nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value = .35
        links.new(tex.outputs['Color'], bump.inputs['Color'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def assembly(name, collection, parent=None, offset=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_size = .12
    obj.parent = parent
    obj.location = offset
    return obj


def mesh(name, bm, mat, parent, mode='box', offset=(0, 0, 0), turn=0, grain=2):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    data.update()
    uv = data.uv_layers.new(name='UVMap')
    axis_range = [(min(v.co[i] for v in data.vertices), max(v.co[i] for v in data.vertices)) for i in range(3)]
    for poly in data.polygons:
        # Each face gets its own projected axes, preserving UV area on bevels and cut faces.
        n = max(range(3), key=lambda i: abs(poly.normal[i]))
        axis_u, axis_v = (i for i in range(3) if i != n)
        if mode == 'grain' and axis_v == grain:
            axis_u, axis_v = axis_v, axis_u
        elif mode == 'paper' and axis_u == 2:
            axis_u, axis_v = axis_v, axis_u
        elif mode == 'leaf' and n == 2:
            axis_u, axis_v = 1, 0
        for loop in poly.loop_indices:
            co = data.vertices[data.loops[loop].vertex_index].co
            if mode in ('leaf', 'paper'):
                uv.data[loop].uv = [(co[i] - axis_range[i][0]) / max(.0001, axis_range[i][1] - axis_range[i][0])
                                    for i in (axis_u, axis_v)]
            else:
                variation = (sum(ord(c) for c in name) % 109) / 109
                uv.data[loop].uv = (co[axis_u] / .8 + variation, co[axis_v] / .19 + variation)
    obj = bpy.data.objects.new(name, data)
    authored.objects.link(obj)
    obj.parent = parent
    obj.location = offset
    obj.rotation_euler.z = turn
    data.materials.append(mats[mat])
    return obj


def box(parent, name, center, size, mat, bevel=.004, mode='box', turn=0, grain=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        for i in range(3):
            v.co[i] *= size[i]
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .23),
                        affect='EDGES', segments=1, clamp_overlap=True)
    return mesh(name, bm, mat, parent, mode, center, turn, grain)


def beam(parent, name, start, end, width, depth, mat, bevel=.003):
    a, b = Vector(start), Vector(end)
    obj = box(parent, name, (a + b) / 2, (width, depth, (b - a).length), mat, bevel, 'grain')
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def rod(parent, name, start, end, r, mat, sides=10, r2=None):
    a, b = Vector(start), Vector(end)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r,
                         radius2=r if r2 is None else r2, depth=(b - a).length)
    obj = mesh(name, bm, mat, parent, 'grain', (a + b) / 2)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj


def slab(parent, name, x0, x1, outline, mat, bevel=0):
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in outline]
    b = [bm.verts.new((x1, y, z)) for y, z in outline]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(len(a)):
        j = (i + 1) % len(a)
        bm.faces.new((a[i], a[j], b[j], b[i]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, affect='EDGES', segments=1, clamp_overlap=True)
    return mesh(name, bm, mat, parent)


def ring(parent, name, cx, cy, cz, outer, inner, thick, mat):
    bm = bmesh.new()
    loops = [[bm.verts.new((cx + x, cy + math.cos(k * math.tau / 14) * r,
                           cz + math.sin(k * math.tau / 14) * r)) for k in range(14)]
             for x, r in ((-thick / 2, outer), (thick / 2, outer),
                          (thick / 2, inner), (-thick / 2, inner))]
    for a, b in zip(loops, loops[1:] + loops[:1]):
        for i in range(14):
            j = (i + 1) % 14
            bm.faces.new((a[i], a[j], b[j], b[i]))
    return mesh(name, bm, mat, parent)


def hardcover(parent, name, xy, z, length, width, height, cover, angle):
    root = assembly(name, authored, parent, (*xy, z))
    root.rotation_euler.z = math.radians(angle)
    board = .009
    box(root, name + ' | lower board', (0, 0, board / 2), (length, width, board), cover, .002)
    box(root, name + ' | upper board', (0, 0, height - board / 2), (length, width, board), cover, .002)
    box(root, name + ' | recessed sewn text block', (-.004, .004, height / 2),
        (length - .025, width - .028, height - 2 * board + .001), 'page edge', .002, 'paper')
    box(root, name + ' | curved cloth spine', (0, -width / 2 + .006, height / 2),
        (length - .007, .018, height - .001), cover, .004)
    for x in (-length * .32, length * .32):
        box(root, name + ' | sewn spine rib', (x, -width / 2 - .003, height / 2),
            (.009, .005, height - .014), cover, .001)
    return root


def books():
    root = assembly('C08', authored)
    hardcover(root, 'Atlas', (-.007, -.021), 0, .408, .278, .098, 'slate linen', -4)
    hardcover(root, 'Collected notes', (-.004, -.021), .097, .379, .258, .088, 'rust linen', 4)
    hardcover(root, 'Field manual', (.003, -.019), .184, .362, .244, .104, 'olive linen', -3)
    hardcover(root, 'Index', (-.011, .231), 0, .344, .178, .052, 'olive linen', 6)
    index = hardcover(root, 'Pocket notebook', (-.025, .237), .051, .290, .159, .04, 'slate linen', -7)
    box(index, 'Notebook closure', (.093, 0, .039), (.016, .164, .006), 'rubber', .002)
    # The right leaf spans x=0..0.24 and y=+/-0.085 in native space. Its top is 2 mm
    # below the moving leaf at rest, and the shallow gutter leaves the hinge unobstructed.
    folio = assembly('Open field journal', authored, root)
    for name, left, right in (('Left', -.211, -.002), ('Right', .002, .240)):
        mid = (left + right) / 2
        span = right - left
        box(folio, name + ' journal case', (mid, 0, .294), (span + .012, .195, .013), 'rust linen', .003)
        block = box(folio, name + ' folded signatures', (mid, 0, .313), (span + .002, .179, .030),
                    'page edge', .003, 'paper')
        leaf = box(folio, name + ' ruled leaf', (mid, 0, .3305), (span + .002, .176, .005),
                   'ruled paper' if name == 'Right' else 'study notes', .001, 'leaf')
        if name == 'Left':
            # The fixed leaf bends gently toward the gutter. The moving side stays flat.
            for obj in (block, leaf):
                for vertex in obj.data.vertices:
                    across = (vertex.co.x + span/2) / span
                    elevation = min(1, max(0, (obj.location.z + vertex.co.z - .299) / .029))
                    vertex.co.z -= .009 * across * elevation
                obj.data.update()
    box(folio, 'Cloth hinge beneath gutter', (0, 0, .299), (.023, .185, .016), 'rust linen', .003)
    box(folio, 'Ochre place ribbon', (-.073, -.096, .310), (.016, .034, .004), 'warm brass', .001,
        turn=math.radians(-9))
    # The adjacent pencil lies against the lower notebook, outside the moving page rectangle.
    rod(root, 'Hex cedar pencil', (-.145, .237, .096), (.121, .224, .096), .007, 'rust linen', 6)
    rod(root, 'Cedar pencil point', (.121, .224, .096), (.145, .223, .096), .007, 'ash timber', 6, .002)
    rod(root, 'Graphite nib', (.145, .223, .096), (.151, .223, .096), .002, 'rubber', 6, .0009)
    return root


def icon_bar(parent, name, a, b, width, depth, mat, front):
    dy, dz = b[0] - a[0], b[1] - a[1]
    obj = box(parent, name, (front + depth / 2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
              (depth, math.hypot(dy, dz) + width * .65, width), mat, .003)
    obj.rotation_euler.x = math.atan2(dz, dy)
    return obj


def five_icons(body, centers, front):
    z = 1.376
    p, o, a, d, f = centers
    for side in (-1, 1):
        outline = [(p + side*y, z + dz) for y, dz in (
            (.145, 0), (.069, .093), (.047, .075), (.109, 0), (.047, -.075), (.069, -.093),
        )]
        slab(body, 'Cast code bracket', front, front+.021, outline, 'slate linen', .002)
    icon_bar(body, 'Painted code slash', (p-.027, z-.105), (p+.027, z+.105),
             .027, .022, 'rust linen', front)
    box(body, 'Office clipboard', (front+.009, o, z), (.018, .207, .245), 'dark timber', .006)
    box(body, 'Office card', (front+.020, o, z-.012), (.005, .170, .193), 'paper', .002)
    box(body, 'Clipboard spring clip', (front+.025, o, z+.099), (.018, .073, .027), 'warm brass', .004)
    for i, w in enumerate((.108, .093, .122)):
        box(body, 'Clipboard guide line', (front+.023, o, z+.036-i*.048), (.003, w, .010), 'slate linen', .0005)
    for cy, cz, radius in ((a, z, .129), (a+.108, z+.082, .044), (a-.112, z+.090, .035)):
        outline = [(cy+math.cos(i*math.pi/4)*radius*(1 if i%2==0 else .30),
                    cz+math.sin(i*math.pi/4)*radius*(1 if i%2==0 else .30)) for i in range(8)]
        slab(body, 'Pressed agent spark', front, front+.024, outline, 'warm brass', .0014)
    box(body, 'Data chart baseline', (front+.007, d, z-.103), (.014, .254, .015), 'dark timber', .002)
    for k, (height, mat) in enumerate(((.072, 'olive linen'), (.142, 'slate linen'), (.200, 'rust linen'))):
        box(body, 'Data chart raised bar', (front+.011, d+(k-1)*.074, z-.094+height/2),
            (.024, .047, height), mat, .004)
    for i, (lo, hi, bottom, top, mat) in enumerate((
        (-.103, .019, -.080, -.008, 'rust linen'),
        (-.069, .097, -.026, .055, 'olive linen'),
        (-.009, .115, .032, .089, 'olive linen'),
    )):
        y = f+(i-1)*.076
        box(body, 'Finance candlestick wick', (front+.006, y, z+(lo+hi)/2),
            (.014, .011, hi-lo), 'dark timber', .002)
        box(body, 'Finance candlestick body', (front+.016, y, z+(bottom+top)/2),
            (.029, .047, top-bottom), mat, .003)


def tooling(tools, c):
    x = -.006
    # Hanging fittings meet the five fixed pegs along the original shared feedback hinge.
    for y in c:
        ring(tools, 'Forged hanging eye', x, y, 0, .024, .013, .012, 'dark steel')
    y = c[0]
    box(tools, 'Hammer forged head', (x, y, -.041), (.045, .148, .058), 'dark steel', .009)
    rod(tools, 'Hammer hardened striking face', (x, y-.061, -.041), (x, y-.098, -.041), .029, 'steel', 10)
    slab(tools, 'Hammer claw', x-.014, x+.014,
         [(y+.049, -.017), (y+.103, -.026), (y+.099, -.043), (y+.056, -.067)], 'dark steel', .002)
    beam(tools, 'Hammer hickory haft', (x, y, -.059), (x, y+.009, -.351), .029, .034, 'ash timber', .005)
    beam(tools, 'Hammer heel sleeve', (x, y+.006, -.244), (x, y+.009, -.359), .039, .046, 'rubber', .006)

    y = c[1]
    slab(tools, 'Wrench drop forged shank and open jaw', x-.009, x+.009,
         [(y-.018, -.237), (y+.020, -.237), (y+.017, -.101), (y+.034, -.069),
          (y+.041, -.034), (y+.028, -.018), (y+.012, -.057), (y-.010, -.057),
          (y-.024, -.020), (y-.039, -.033), (y-.037, -.071), (y-.018, -.100)], 'steel', .002)
    box(tools, 'Wrench suspension neck', (x, y+.028, -.025), (.012, .020, .044), 'steel', .002)
    ring(tools, 'Wrench ring end', x, y, -.253, .036, .021, .014, 'steel')

    y = c[2]
    rod(tools, 'Screwdriver striking cap', (x, y, -.048), (x, y, -.015), .022, 'dark steel')
    rod(tools, 'Screwdriver molded grip', (x, y, -.148), (x, y, -.044), .025, 'rubber', 10, .028)
    for z in (-.055, -.075, -.095, -.115, -.135):
        rod(tools, 'Screwdriver grip band', (x, y, z-.004), (x, y, z+.004), .027, 'orange grip', 10)
    rod(tools, 'Screwdriver hex collar', (x, y, -.172), (x, y, -.144), .015, 'steel', 6)
    rod(tools, 'Screwdriver steel shank', (x, y, -.321), (x, y, -.172), .009, 'steel', 8)
    box(tools, 'Screwdriver blade tip', (x, y, -.325), (.012, .020, .028), 'steel', .002)

    y = c[3]
    teeth = []
    for i in range(9):
        depth = -.090-i*.029
        edge = y+.062-i*.0024
        teeth.extend([(edge, depth), (edge+.009, depth-.011), (edge-.001, depth-.019)])
    slab(tools, 'Saw with tapered toothed blade', x-.005, x+.005,
         [(y-.052, -.077), (y+.053, -.077), *teeth, (y+.030, -.368), (y-.027, -.367)],
         'steel')
    slab(tools, 'Saw hardwood handle', x-.021, x+.021,
         [(y-.069, -.015), (y+.066, -.015), (y+.082, -.043), (y+.067, -.090),
          (y-.045, -.099), (y-.072, -.076)], 'ash timber', .004)
    for dy in (-.033, .037):
        rod(tools, 'Saw rivet', (x+.019, y+dy, -.059), (x+.024, y+dy, -.059), .008, 'warm brass')

    y = c[4]
    for s in (-1, 1):
        px = x + .008 * s
        outline = [(y+s*.013, -.017), (y+s*.029, -.047), (y+s*.025, -.085),
                   (y+s*.008, -.121), (y-s*.027, -.248), (y-s*.048, -.241),
                   (y-s*.016, -.116), (y+s*.006, -.071)]
        slab(tools, 'Pliers forged jaw and tang', px-.009, px+.009, outline, 'steel', .002)
        beam(tools, 'Pliers dipped insulated grip', (px, y-s*.026, -.181),
             (px, y-s*.065, -.347), .034, .036, 'orange grip', .007)
    rod(tools, 'Pliers pivot pin', (x-.018, y, -.110), (x+.026, y, -.110), .013, 'dark steel')


def wall(extras):
    root = assembly('C11', authored)
    root['labelPlatesGLB'] = extras['labelPlatesGLB']
    root['panelCentresGLB_z'] = extras['panelCentresGLB_z']
    body = assembly('C11_body', authored, root)
    tools = assembly('C11_tools', authored, root, TOOL_PIVOT)
    c = [-p['centre'][2] for p in json.loads(extras['labelPlatesGLB'])]
    x = WALL_SHIFT
    for y in (-.950, .950):
        box(body, 'Upright with chamfer', (x-.005, y, 1.003), (.082, .086, 2.006), 'oak timber', .008, 'grain')
        box(body, 'Ground-contact oak skid', (x-.160, y, .040), (.631, .093, .080), 'dark timber', .011, 'grain', grain=0)
        beam(body, 'Back diagonal brace', (x-.421, y, .068), (x-.034, y, 1.457),
             .067, .065, 'oak timber', .005)
        for z in (.132, 1.430):
            rod(body, 'Brace pin', (x-.048, y-.046, z), (x-.048, y+.046, z), .014, 'warm brass', 8)
        box(body, 'Skid front protection plate', (x+.149, y, .040), (.022, .097, .069), 'dark steel', .004)
    for z in (.264, 1.905):
        box(body, 'Through rail', (x, 0, z), (.088, 1.90, .086), 'oak timber', .006, 'grain', grain=1)
    for z in (.574, 1.268, 1.692):
        box(body, 'Rear supporting rail', (x-.022, 0, z), (.046, 1.820, .071), 'oak timber', .004, 'grain', grain=1)
    for side in (-1, 1):
        for j in range(3):
            cx = side * (.044 + j*.084)
            roof = box(body, 'Rain-cap cedar board', (x+cx, 0, 2.079-abs(cx)*.494),
                       (.094, 2.052, .039), 'dark timber', .007, 'grain', grain=1)
            roof.rotation_euler.y = math.radians(26)*side
    box(body, 'Roof ridge cap', (x, 0, 2.082), (.063, 2.06, .041), 'oak timber', .008, 'grain', grain=1)
    for y in c:
        box(body, 'Panel upper ash plank', (x+.011, y, 1.493), (.038, .333, .734),
            'ash timber', .004, 'grain')
        box(body, 'Panel lower oak pegboard', (x+.008, y, .709), (.035, .333, .824),
            'oak timber', .004, 'grain')
        box(body, 'Framed raised icon card', (x+.041, y, 1.378), (.023, .297, .289),
            'oak timber', .005, 'grain')
        box(body, 'Icon card inset', (x+.052, y, 1.378), (.014, .275, .268), 'ash timber', .004, 'grain')
        box(body, 'Bilingual card brass frame', (x+.031, y, 1.700), (.022, .299, .172), 'warm brass', .005)
        # The real localized Canvas is at x=.1729 with 0.0024 m air above this blank insert.
        box(body, 'Bilingual blank label backing', (.1657, y, 1.700), (.0096, .282, .156), 'paper', .003)
        for side in (-1, 1):
            dy = y+side*.129
            rod(body, 'Label mounting pin', (.165, dy, 1.70), (.176, dy, 1.70), .006, 'warm brass', 8)
        for yy in (-.114, -.057, 0, .057, .114):
            for zz in (.582, .666, .750, .834, .918, 1.002, 1.086):
                if yy == 0 and zz >= .918:
                    continue
                rod(body, 'Peg aperture dark recess', (x+.024, y+yy, zz),
                    (x+.0262, y+yy, zz), .008, 'shadow', 8)
        rod(body, 'Tool peg shoulder washer', (x+.021, y, TOOL_PIVOT.z),
            (x+.034, y, TOOL_PIVOT.z), .027, 'warm brass')
        rod(body, 'Fixed tool peg', (x+.034, y, TOOL_PIVOT.z),
            (x+.101, y, TOOL_PIVOT.z), .011, 'dark steel')
    for y in (-.743+.371/2, -.371+.371/2, .371/2, .743-.371/2):
        box(body, 'Separating upright batten', (x+.019, y, 1.092),
            (.064, .036, 1.542), 'dark timber', .005, 'grain')
    box(body, 'Shallow tray deck', (x+.108, 0, .457), (.192, 1.812, .037), 'oak timber', .006, 'grain', grain=1)
    box(body, 'Tray front retaining lip', (x+.191, 0, .484), (.030, 1.837, .055),
        'dark timber', .005, 'grain', grain=1)
    for y in (-.655, .655):
        slab(body, 'Ledge corbel', x+.026, x+.154,
             [(y-.019, .361), (y+.019, .361), (y+.019, .443), (y-.019, .443)], 'dark timber', .003)
        rod(body, 'Tray face pin', (x+.203, y, .483), (x+.211, y, .483), .010, 'warm brass')
    tin_x = x+.100
    rod(body, 'Slate fastener tin', (tin_x, -.364, .4755), (tin_x, -.364, .555), .043, 'slate linen', 12)
    rod(body, 'Tin rolled lid', (tin_x, -.364, .550), (tin_x, -.364, .563), .045, 'steel', 12)
    rod(body, 'Marking brush cup', (tin_x, .415, .4755), (tin_x, .415, .543), .032, 'warm brass', 12)
    for dy, lean in ((-.013, -.033), (.010, .029)):
        rod(body, 'Brush handle', (tin_x, .415+dy, .540), (tin_x-.013, .415+dy+lean, .653),
            .006, 'ash timber', 8)
    five_icons(body, c, x+.058)
    tooling(tools, c)
    return root


def orm_palette(directory):
    """Pack each original physical pair in an 8×8 constant cell with 4 px padding."""
    keys = dict.fromkeys(CLOTH_KEYS + FLAT_BODY_KEYS + NO_SHADOW_KEYS + FLAT_TOOL_KEYS)
    data = {}
    for index, key in enumerate(keys):
        original = mats[key]
        x = (index % ORM_COLUMNS) * ORM_TILE + ORM_TILE / 2
        y = (index // ORM_COLUMNS) * ORM_TILE + ORM_TILE / 2
        roughness = original.roughness
        metallic = original.metallic
        rgba = tuple(original.diffuse_color)
        data[key] = {
            'sourceMaterial': original.name,
            'rgbaLinear': rgba,
            'texcoord1Gltf': (x / ORM_SIZE, y / ORM_SIZE),
            'roughness': roughness,
            'metallic': metallic,
            'roughnessByte': round(255 * roughness),
            'metallicByte': round(255 * metallic),
        }
    swatches = list(data.values())

    def pixel(x, y):
        cell = (y // ORM_TILE) * ORM_COLUMNS + x // ORM_TILE
        if cell >= len(swatches):
            return 255, 255, 0
        return 255, swatches[cell]['roughnessByte'], swatches[cell]['metallicByte']

    path = directory / 'workshop-orm.png'
    png(path, ORM_SIZE, pixel)
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = 'Non-Color'
    image.pack()
    return image, data


def palette_material(name, image, normal=None):
    mat = material(name, 'ffffff', 1, 1, normal=normal)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    color = nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'ORMIndex'
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Closest'
    texture.extension = 'EXTEND'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(texture.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


def encode_palette(mesh, target, swatch):
    color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
    for vertex in color.data:
        vertex.color = swatch['rgbaLinear']
    uv1 = mesh.uv_layers.new(name='ORMIndex', do_init=False)
    u, v = swatch['texcoord1Gltf']
    for corner in uv1.data:
        corner.uv = (u, 1-v)
    mesh.uv_layers.active_index = 0
    mesh.materials.clear()
    mesh.materials.append(target)


def descendants(root):
    return [obj for obj in [root, *root.children_recursive] if obj.type == 'MESH']


def import_glb(path, col):
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    added = set(bpy.data.objects) - previous
    for obj in added:
        col.objects.link(obj)
        for old in list(obj.users_collection):
            if old != col:
                old.objects.unlink(obj)
    return added


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def snapshot(root):
    lo, hi = [math.inf]*3, [-math.inf]*3
    count, degenerate, zero_uv = 0, 0, 0
    names = set()
    for obj in descendants(root):
        data = obj.data
        data.calc_loop_triangles()
        for v in data.vertices:
            p = obj.matrix_world @ v.co
            for i in range(3):
                assert math.isfinite(p[i]), obj.name
                lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
        uv = data.uv_layers.active
        names.update(mat.name.split('.00')[0] for mat in data.materials)
        for t in data.loop_triangles:
            count += 1
            a, b, c = (data.vertices[i].co for i in t.vertices)
            if ((b-a).cross(c-a)).length < 1e-10:
                degenerate += 1
            if uv:
                u, v, w = (uv.data[i].uv for i in t.loops)
                if abs((v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x)) < 1e-9:
                    zero_uv += 1
    return {'minBlenderXYZ': lo, 'maxBlenderXYZ': hi, 'triangles': count, 'zeroAreaTriangles': degenerate,
            'zeroUVAreaTriangles': zero_uv, 'meshCount': len(descendants(root)), 'materials': sorted(names)}


def batched_export(roots, palette_image, palette):
    col = collection('EXPORT_ONLY')
    runtime = {}
    cloth = palette_material('colored bookcloth palette', palette_image, normal='bookcloth-normal')
    opaque = palette_material('opaque surface palette', palette_image)
    fine = palette_material('small fittings palette', palette_image)
    palette_materials = {cloth, opaque, fine}
    authored_key = {mat: key for key, mat in mats.items()}
    rules = {
        'C08': {mats[key]: cloth for key in CLOTH_KEYS},
        'C11_body': {mats[key]: target for keys, target in (
            (CLOTH_KEYS, cloth), (FLAT_BODY_KEYS, opaque), (NO_SHADOW_KEYS, fine)) for key in keys},
        'C11_tools': {mats[key]: opaque for key in FLAT_TOOL_KEYS},
    }
    source_inventory = {}
    bpy.context.view_layer.update()
    for key in ('C08', 'C11', 'C11_body', 'C11_tools'):
        source = roots[key]
        obj = assembly('Export ' + key, col, runtime.get('C11') if key in BRANCHES[1:] else None, source.location)
        for prop in source.keys():
            obj[prop] = source[prop]
        obj['workshopBranch'] = key
        runtime[key] = obj
        if key == 'C11':
            continue
        groups = {}
        for part in descendants(source):
            original = part.data.materials[0]
            target = rules[key].get(original, original)
            groups.setdefault(target, []).append(part)
        frame = source.matrix_world.inverted()
        source_inventory[key] = {}
        for target, parts in sorted(groups.items(), key=lambda group: group[0].name):
            copies = []
            triangles_by_source = {}
            for part in sorted(parts, key=lambda piece: piece.name):
                original = part.data.materials[0]
                local = part.data.copy()
                local.transform(frame @ part.matrix_world)
                if target in palette_materials:
                    encode_palette(local, target, palette[authored_key[original]])
                    local.calc_loop_triangles()
                    triangles_by_source[authored_key[original]] = (
                        triangles_by_source.get(authored_key[original], 0) + len(local.loop_triangles)
                    )
                obj_copy = bpy.data.objects.new('Batch part', local)
                col.objects.link(obj_copy)
                copies.append(obj_copy)
            bpy.ops.object.select_all(action='DESELECT')
            for copy in copies:
                copy.select_set(True)
            first = copies[0]
            bpy.context.view_layer.objects.active = first
            if len(copies) > 1:
                bpy.ops.object.join()
            first.name = key + ' | ' + target.name.removeprefix('Workshop | ')
            first.parent = obj
            if target in palette_materials:
                first['workshopOrm'] = True
                source_inventory[key][target.name] = triangles_by_source
            # Thin apertures and foil accents can receive existing shadows without casting them.
            if target == fine or target in (mats[name] for name in NO_SHADOW_KEYS):
                first['noShadow'] = True
    authored.hide_render = True
    authored.hide_viewport = True
    # Blender names are unique across the file. Use the exact runtime names while originals
    # are hidden; the editable native has already been saved with its semantic names.
    for key, obj in runtime.items():
        roots[key].name = 'Native ' + key
        obj.name = key
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(STAGED_PACK), export_format='GLB', use_selection=True,
                              export_apply=True, export_extras=True, export_materials='EXPORT',
                              export_vertex_color='MATERIAL', export_all_vertex_colors=False)
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col)
    return source_inventory


def audit_palette(glb, palette, inventory, png_path):
    raw = STAGED_PACK.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    binary = memoryview(raw)[28 + json_length:]

    def read_accessor(index):
        accessor = glb['accessors'][index]
        view = glb['bufferViews'][accessor['bufferView']]
        component = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[accessor['componentType']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
        fmt = struct.Struct('<' + component * count)
        stride = view.get('byteStride', fmt.size)
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        return [fmt.unpack_from(binary, offset + stride * i) for i in range(accessor['count'])]

    branches = {node['name']: node for node in glb['nodes'] if node['name'] in BATCH_COUNTS}
    max_color_error = max_orm_error = 0
    images_used = set()
    by_coordinate = {swatch['texcoord1Gltf']: key for key, swatch in palette.items()}
    for branch, root in branches.items():
        children = [glb['nodes'][i] for i in root['children']]
        assert len(children) == BATCH_COUNTS[branch], branch
        seen = set()
        for child in children:
            if not child.get('extras', {}).get('workshopOrm'):
                continue
            mesh = glb['meshes'][child['mesh']]
            assert len(mesh['primitives']) == 1, child['name']
            primitive = mesh['primitives'][0]
            mat = glb['materials'][primitive['material']]
            pbr = mat['pbrMetallicRoughness']
            assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and 'baseColorTexture' not in pbr
            assert pbr.get('roughnessFactor', 1) == pbr.get('metallicFactor', 1) == 1
            orm = pbr['metallicRoughnessTexture']
            assert orm.get('texCoord') == 1, mat
            texture = glb['textures'][orm['index']]
            sampler = glb['samplers'][texture['sampler']]
            assert sampler.get('magFilter') == 9728, sampler
            images_used.add(texture['source'])
            normal = mat.get('normalTexture')
            if 'bookcloth palette' in mat['name']:
                assert normal is not None and normal.get('texCoord', 0) == 0
                assert abs(normal['scale'] - .35) < 1e-6
            else:
                assert normal is None
            no_shadow = 'small fittings palette' in mat['name']
            assert child['extras'].get('noShadow', False) == no_shadow
            attrs = primitive['attributes']
            assert glb['accessors'][attrs['COLOR_0']]['componentType'] == 5126
            swatches = [by_coordinate[uv] for uv in read_accessor(attrs['TEXCOORD_1'])]
            colors = read_accessor(attrs['COLOR_0'])
            for key, rgba in zip(swatches, colors, strict=True):
                max_color_error = max(max_color_error, *(abs(a-b) for a, b in zip(palette[key]['rgbaLinear'], rgba)))
            counts = Counter()
            indices = read_accessor(primitive['indices'])
            for i in range(0, len(indices), 3):
                a, b, c = [swatches[idx] for (idx,) in indices[i:i+3]]
                assert a == b == c, child['name']
                counts[a] += 1
            assert counts == inventory[branch][mat['name']], (branch, mat['name'], counts)
            seen.add(mat['name'])
        assert seen == inventory[branch].keys()
    assert max_color_error < 1e-7, max_color_error
    assert len(images_used) == 1, images_used
    image = glb['images'][images_used.pop()]
    view = glb['bufferViews'][image['bufferView']]
    offset = view.get('byteOffset', 0)
    # Matching packed bytes verify the PNG used by the exporter, not just the native input.
    assert binary[offset:offset + view['byteLength']] == png_path.read_bytes(), image
    for swatch in palette.values():
        for role in ('roughness', 'metallic'):
            max_orm_error = max(max_orm_error, abs(swatch[role] - swatch[role + 'Byte']/255))
    assert max_orm_error <= .5/255 + 1e-8
    return {'size': [ORM_SIZE, ORM_SIZE], 'constantCellSize': ORM_TILE, 'paddingTexels': ORM_TILE//2,
            'maxOrmQuantization': max_orm_error, 'maxLinearColorError': max_color_error,
            'glbPaletteMatchesAuthoredPng': True, 'branches': inventory, 'swatches': palette}


def make_review_rig():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.resolution_x, scene.render.resolution_y = 850, 640
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 93
    world = bpy.data.worlds.new('Review ambient')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.68, .72, .78, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .36
    scene.world = world
    rig = collection('REVIEW_ONLY')
    data = bpy.data.cameras.new('Matched comparison camera')
    data.type = 'ORTHO'
    camera = bpy.data.objects.new(data.name, data)
    rig.objects.link(camera)
    scene.camera = camera
    for name, energy, degrees in (('Broad key', 2.4, 52), ('Soft fill', .64, 236)):
        data = bpy.data.lights.new(name, 'SUN')
        data.energy = energy
        data.angle = math.radians(12)
        light = bpy.data.objects.new(name, data)
        rig.objects.link(light)
        light.rotation_euler = (math.radians(46), 0, math.radians(degrees))
    floor = bpy.data.meshes.new('Neutral floor')
    floor.from_pydata([(-10,-10,-.001), (10,-10,-.001), (10,10,-.001), (-10,10,-.001)], [], [(0,1,2,3)])
    ground = bpy.data.objects.new('Neutral floor', floor)
    rig.objects.link(ground)
    floor.materials.append(material('review floor', '89867d', .91))
    clay = material('neutral clay', 'a5a09a', .82)
    return camera, clay


def render_reviews(camera, clay, baseline, fresh):
    scene = bpy.context.scene
    receipts = {}
    for key in FAMILIES:
        if key == 'C08':
            target, vector, scale = Vector((.01, 0, .13)), Vector((1, -.50, .74)), .94
        else:
            target, vector, scale = Vector((.02, 0, 1.00)), Vector((1, -.32, .24)), 3.10
        camera.location = target + vector.normalized() * 8
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        receipts[key] = {'cameraLocationBlenderXYZ': list(camera.location), 'cameraTargetBlenderXYZ': list(target),
                         'orthoScale': scale, 'images': {}}
        for label, root in (('baseline', baseline[key]), ('reimport', fresh[key]), ('clay', fresh[key])):
            for obj in [*baseline.values(), *fresh.values()]:
                for part in descendants(obj):
                    part.hide_render = obj != root
            scene.view_layers[0].material_override = clay if label == 'clay' else None
            path = EVIDENCE / f'{key}-{label}.jpg'
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            receipts[key]['images'][label] = {'file': path.name, 'sha256': sha(path)}
    return receipts


PUBLIC.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)
map_dir = HERE / 'maps'
make_maps(map_dir)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
authored = collection('EDITABLE_WORKSHOP_ASSETS')
baselines = collection('BASELINE_FROZEN_FROM_GIT')
baseline_paths = {key: HERE / 'baseline' / f'{key}.glb' for key in FAMILIES}
baseline = {}
for key, path in baseline_paths.items():
    nodes = import_glb(path, baselines)
    baseline[key] = next(obj for obj in nodes if obj.name == key)
    for obj in nodes:
        obj.name = 'Baseline ' + obj.name
baselines.hide_render = True
baselines.hide_viewport = True

images = {}
for path in sorted(map_dir.glob('*.png')):
    if path.name == 'workshop-orm.png':
        continue
    image = bpy.data.images.load(str(path))
    if path.stem.endswith('-normal'):
        image.colorspace_settings.name = 'Non-Color'
    image.pack()
    images[path.stem] = image

mats = {
    'slate linen': material('slate bookcloth', '3f5a6a', .82, normal='bookcloth-normal'),
    'olive linen': material('olive bookcloth', '6f7d48', .85, normal='bookcloth-normal'),
    'rust linen': material('burnt-orange bookcloth', 'aa5938', .79, normal='bookcloth-normal'),
    'page edge': material('layered paper edges', 'dfd2b8', .91, image='page-edge'),
    'ruled paper': material('ruled journal leaf', 'eadfc8', .94, image='ruled-leaf'),
    'study notes': material('journal study notes', 'eadfc8', .94, image='study-notes'),
    'paper': material('unprinted warm paper', 'e8d9b8', .87),
    'oak timber': material('oiled oak longitudinal', 'b39c7e', .66, image='oak-timber'),
    'ash timber': material('warm ash longitudinal', 'd3b890', .74, image='ash-timber'),
    'dark timber': material('dark-stained frame', '634633', .70),
    'warm brass': material('satin brass', 'be945b', .43, .58),
    'dark steel': material('blackened steel', '4a4c49', .46, .66),
    'steel': material('forged tool steel', 'a0a7a5', .32, .72),
    'rubber': material('charcoal rubber', '333c3a', .85),
    'orange grip': material('orange dipped rubber', 'b65f38', .73),
    'shadow': material('aperture', '5e4b38', .93),
}
old_wall = load_json(baseline_paths['C11'])
wall_extras = next(node['extras'] for node in old_wall['nodes'] if node['name'] == 'C11')
roots = {'C08': books(), 'C11': wall(wall_extras)}
roots.update({name: bpy.data.objects[name] for name in BRANCHES[1:]})
for key, root in roots.items():
    root['workshopBranch'] = key
camera, clay = make_review_rig()
bpy.context.view_layer.update()
source = {key: snapshot(roots[key]) for key in BRANCHES}
assert all(item['zeroAreaTriangles'] == item['zeroUVAreaTriangles'] == 0 for item in source.values()), source
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE), compress=True)
palette_image, palette = orm_palette(map_dir)
inventory = batched_export(roots, palette_image, palette)
first = HERE / 'first-export.json'
if not first.exists():
    first.write_text(json.dumps({
        'nativeSha256': sha(NATIVE), 'runtimeSha256': sha(STAGED_PACK),
        'generatorSha256': sha(Path(__file__)), 'textureGeneratorSha256': sha(HERE / 'surfaces.py'),
    }, indent=2) + '\n')
glb = load_json(STAGED_PACK)
node = {n['name']: n for n in glb['nodes']}
old_node = {n['name']: n for n in old_wall['nodes']}
assert node['C11']['extras']['labelPlatesGLB'] == wall_extras['labelPlatesGLB']
assert node['C11_tools']['translation'] == old_node['C11_tools']['translation'], node['C11_tools']
leaf = bpy.data.objects['Right ruled leaf']
coords = [leaf.matrix_world @ vertex.co for vertex in leaf.data.vertices]
assert abs(max(v.z for v in coords) - .333) < .000001
assert max(v.x for v in coords) >= .24 and min(v.y for v in coords) <= -.085 and max(v.y for v in coords) >= .085
assert 'translation' not in node['C08'] and 'translation' not in node['C11_body']
assert all({'POSITION', 'NORMAL', 'TEXCOORD_0'} <= p['attributes'].keys() for mesh_item in glb['meshes']
           for p in mesh_item['primitives'])
assert all(not item.get('doubleSided', False) for item in glb['materials'])
palette_audit = audit_palette(glb, palette, inventory, map_dir / 'workshop-orm.png')
fresh_collection = collection('FRESH_GLTF_REIMPORT')
fresh = {obj.get('workshopBranch'): obj for obj in import_glb(STAGED_PACK, fresh_collection)
         if obj.get('workshopBranch') in roots}
bpy.context.view_layer.update()
roundtrip = {key: snapshot(fresh[key]) for key in BRANCHES}
for key in BRANCHES:
    a, b = source[key], roundtrip[key]
    assert b['meshCount'] == BATCH_COUNTS[key], (key, b['meshCount'])
    for field in ('zeroAreaTriangles', 'zeroUVAreaTriangles', 'triangles'):
        assert a[field] == b[field], (key, field, a[field], b[field])
    for field in ('minBlenderXYZ', 'maxBlenderXYZ'):
        assert max(abs(x-y) for x,y in zip(a[field], b[field])) < .00001, (key, field, a[field], b[field])

manifest = {
    'generator': 'tools/world/camp-workshop-craft/build.py',
    'baselineRevision': '3c66e8da538e83a9bbc56aa65592251b87764cca',
    'baseline': {key: {'source': f'public/assets/world/camp/{key}.glb', 'sha256': sha(path)}
                 for key, path in baseline_paths.items()},
    'blender': bpy.app.version_string, 'unit': 'meters', 'front': '+X',
    'runtime': {'url': '/assets/world/camp-workshop-craft/camp-workshop.glb', 'bytes': STAGED_PACK.stat().st_size,
                'sha256': sha(STAGED_PACK), 'toolPivotGltfXYZ': node['C11_tools']['translation'],
                'bookLeafTop': .333, 'bookFlipRest': .335, 'labelPlanesGLTF': json.loads(wall_extras['labelPlatesGLB'])},
    'native': {'path': 'tools/world/camp-workshop-craft/workshop.blend', 'sha256': sha(NATIVE)},
    'materials': glb['materials'],
    'textures': {p.name: {'sha256': sha(p), 'size': list(struct.unpack('>2I', p.read_bytes()[16:24])),
                          'authoring': 'Deterministic procedural maps from surfaces.py'}
                 for p in sorted(map_dir.glob('*.png'))},
    'sourceAudit': source, 'reimportAudit': roundtrip, 'runtimeOrm': palette_audit,
}
scenario = Path.home() / '.codex/skills/blender-material-craft/scripts'
if scenario.exists():
    sys.path.insert(0, str(scenario))
    from scenario_tools import tool
    materials_tool = tool('materials')
    manifest['scenario'] = {
        'glb': tool('export').glb_summary(STAGED_PACK),
        'materialIssues': {mat.name: materials_tool.audit_material(mat) for mat in mats.values()},
    }
    assert not any(issue[0] == 'error' for issues in manifest['scenario']['materialIssues'].values() for issue in issues)
manifest['reviewRig'] = {'engine': 'Cycles CPU', 'samples': 8, 'resolution': [850, 640], 'view': 'AgX',
                         'exposure': 0, 'ambientStrength': .36,
                         'sunEnergyAzimuth': [[2.4, 52], [.64, 236]], 'sunTilt': 46, 'sunAngle': 12}
def write_manifest():
    (HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

if '--skip-review' not in sys.argv:
    baselines.hide_render = False
    manifest['reviewRig']['shots'] = render_reviews(camera, clay, baseline, {key: fresh[key] for key in FAMILIES})
STAGED_PACK.replace(PACK)
write_manifest()
