"""Editable workshop families and material-batched GLB, in fixed game datums.

blender --background --factory-startup --threads 2 --python tools/world/coaster-workshop-craft-20261105/build.py
No lights, render rigs, physics or animation are exported.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=ROOT / 'docs/world/phase-2-playground/coaster-workshop-craft-20261105')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = 'METRIC'
ASSET = bpy.data.collections.new('AUTHOR | Intent workshop native parts')
bpy.context.scene.collection.children.link(ASSET)
OWNERS = {}


def native(p):
    return (p[0], -p[2], p[1])


def linear(value):
    rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def material(name, color, roughness, metallic=0, coat=0, emission=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    p = result.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*linear(color), 1)
    result.diffuse_color = (*linear(color), 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = .24
    if emission:
        p.inputs['Emission Color'].default_value = (*linear(color), 1)
        p.inputs['Emission Strength'].default_value = emission
    return result


M = {
    'enamel': material('01 Petrol baked enamel', '42636d', .35, .17, .30),
    'graphite': material('02 Blue graphite inset', '304954', .43, .12, .16),
    'copper': material('03 Copper satin powder coat', 'ba814c', .33, .29, .34),
    'steel': material('04 Brushed stainless work surface', 'b2c0c0', .31, .88),
    'rubber': material('05 Graphite molded liner', '28353a', .74),
    'ivory': material('06 Warm porcelain equipment', 'dce1d8', .38, .08, .20),
    'bronze': material('07 Bell bronze', 'c79d5d', .30, .78),
    'cyan': material('08 Cyan instrument lens', '71d6d1', .27, .18, .18, .22),
}
rng = np.random.default_rng(61105)
y, x = np.mgrid[:256, :256]
for key, values in {
    'enamel': np.clip(.35 + rng.normal(0, .012, x.shape), .30, .40),
    'copper': np.clip(.33 + .012 * np.sin(x * .16 + np.sin(y * .18)) + rng.normal(0, .012, x.shape), .28, .39),
    'steel': np.clip(.31 + .027 * np.sin(y * math.tau * 81 / 256) + rng.normal(0, .01, x.shape), .24, .39),
}.items():
    image = bpy.data.images.new(f'{key} fabricated roughness 256', width=256, height=256)
    image.colorspace_settings.name = 'Non-Color'
    pixels = np.ones((256, 256, 4), np.float32)
    pixels[:, :, :3] = values[:, :, None]
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(OUT / f'{key}-roughness-256.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    node = M[key].node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    M[key].node_tree.links.new(node.outputs['Color'], M[key].node_tree.nodes.get('Principled BSDF').inputs['Roughness'])


def owner(name):
    root = bpy.data.objects.new(name, None)
    ASSET.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = .1
    OWNERS[name] = root
    return root


def link(obj, root, mat):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    ASSET.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(M[mat])
    return obj


def uv(obj):
    data = obj.data
    layer = data.uv_layers.active or data.uv_layers.new(name='FabricationUV')
    for face in data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        u, v = [(1, 2), (0, 2), (0, 1)][axis]
        for i in face.loop_indices:
            co = data.vertices[data.loops[i].vertex_index].co
            layer.data[i].uv = (co[u] / .32, co[v] / .32)


def mesh(name, points, faces, root, mat, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([native(p) for p in points], [], faces)
    data.update()
    result = link(bpy.data.objects.new(name, data), root, mat)
    for p in data.polygons:
        p.use_smooth = smooth
    uv(result)
    return result


def box(name, at, size, radius, root, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=native(at))
    result = bpy.context.object
    result.name = name
    result.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(result, root, mat)
    if radius > 0:
        bevel = result.modifiers.new('Eased folded or cast edges', 'BEVEL')
        bevel.width = min(radius, min(size) * .45)
        bevel.segments = 3
    normal = result.modifiers.new('Face weighted normals', 'WEIGHTED_NORMAL')
    normal.keep_sharp = True
    for p in result.data.polygons:
        p.use_smooth = True
    uv(result)
    return result


def tube(name, points, radius, root, mat, sides=12):
    path = [Vector(p) for p in points]
    closed = len(path) > 3 and (path[0] - path[-1]).length < 1e-6
    if closed:
        path.pop()
    verts, faces = [], []
    for i, p in enumerate(path):
        tangent = (path[(i + 1) % len(path)] - path[(i - 1) % len(path)]).normalized() if closed else (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        ref = Vector((0, 1, 0)) if abs(tangent.y) < .97 else Vector((0, 0, 1))
        a = tangent.cross(ref).normalized()
        b = tangent.cross(a).normalized()
        for k in range(sides):
            angle = math.tau * k / sides
            verts.append(tuple(p + radius * (math.cos(angle) * a + math.sin(angle) * b)))
    for i in range(len(path) if closed else len(path) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, (b + sides) % len(verts), (a + sides) % len(verts)))
    if not closed:
        faces += [tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))]
    result = mesh(name, verts, faces, root, mat)
    if not closed:
        for p in list(result.data.polygons)[-2:]:
            p.use_smooth = False
    return result


def turned(name, at, rows, root, mat, sides=40):
    # Closed radial profile, including an inner wall when supplied.
    points, faces = [], []
    for height, radius in rows:
        for k in range(sides):
            a = math.tau * k / sides
            points.append((at[0] + radius * math.cos(a), at[1] + height, at[2] + radius * math.sin(a)))
    for j in range(len(rows)):
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            c, d = ((j + 1) % len(rows)) * sides + i, ((j + 1) % len(rows)) * sides + (i + 1) % sides
            faces.append((a, c, d, b))
    return mesh(name, points, faces, root, mat)


def rounded_ring(at, width, depth, radius, y):
    points = []
    hx, hz = width / 2, depth / 2
    for cx, cz, angle in ((hx-radius, hz-radius, 0), (-hx+radius, hz-radius, 90), (-hx+radius, -hz+radius, 180), (hx-radius, -hz+radius, 270)):
        for i in range(7):
            a = math.radians(angle + i * 90 / 7)
            points.append((at[0] + cx + radius * math.cos(a), at[1] + y, at[2] + cz + radius * math.sin(a)))
    return points


def crown(name, at, width, depth, heights, root, mat):
    # Broad crown and rolled skirt. All heights carry a distinct radial inset.
    rings = [rounded_ring(at, width - inset * 2, depth - inset * 2, min(.17, depth * .22) - inset * .25, height)
             for height, inset in heights]
    n = len(rings[0])
    faces = [(j*n+i, (j+1)*n+i, (j+1)*n+(i+1)%n, j*n+(i+1)%n)
             for j in range(len(rings)-1) for i in range(n)]
    faces += [tuple(range(n)), tuple(reversed(range((len(rings)-1)*n, len(rings)*n)))]
    result = mesh(name, sum(rings, []), faces, root, mat)
    for p in list(result.data.polygons)[-2:]:
        p.use_smooth = False
    return result


def contact_housing(name, at, size, root, mat):
    """Exact old six-point upper chamfer, for contact-bearing apparatus.

    Rich curved construction can sit behind/below this shell; the physical
    upper profile is deliberately not rounded away from the frozen collider.
    """
    w,h,d=size
    cut=min(.65,h*.2,w*.15)
    outline=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2-cut),(w/2-cut,h/2),(-w/2+cut,h/2),(-w/2,h/2-cut)]
    points=[(at[0]+x,at[1]+y,at[2]+z) for z in (-d/2,d/2) for x,y in outline]
    n=len(outline)
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    faces += [tuple(reversed(range(n))),tuple(range(n,2*n))]
    return mesh(name,points,faces,root,mat,False)


static = owner('StaticWorkshop')
TOOLS = [('intake', -16, 73), ('lookup', -24, 65), ('plan', -20, 60), ('debug', -15, 59), ('rewrite', -10, 62), ('extract', -8, 67), ('act', -9, 73)]


def station(kind, x, z):
    name = kind.capitalize()
    def B(label, p, size, mat='enamel', r=.06):
        return box(f'{name} | {label}', (x+p[0], p[1], z+p[2]), size, r, static, mat)
    def T(label, a, b, radius=.04, mat='steel', sides=12):
        return tube(f'{name} | {label}', [(x+a[0], a[1], z+a[2]), (x+b[0], b[1], z+b[2])], radius, static, mat, sides)
    B('foundation shoe', (0,.15,0), (3.1,.3,2.65), 'ivory', .08)
    # Folded worktop matches original top datum at 1.33, with readable rolled edges.
    crown(f'{name} | continuous rolled worktop', (x,0,z), 2.8, 2.3,
          [(1.22,.035),(1.255,0),(1.30,0),(1.33,.045)], static, 'steel')
    # The existing full cabinet collider is 1.36 high, not the old 1.33
    # visible plate. Keep a real full-width walking cap at that authority.
    if kind == 'plan':
        for label,p,size in [
            ('left',(-1.27,1.345,0),(.26,.03,2.3)),
            ('right',(1.12,1.345,0),(.56,.03,2.3)),
            ('rear',(-.15,1.345,-.9475),(1.98,.03,.405)),
            ('front',(-.15,1.345,.8275),(1.98,.03,.645)),
        ]: B('contact cap '+label,p,size,'steel',0)
    else:
        B('full walking contact cap',(0,1.345,0),(2.8,.03,2.3),'steel',0)
    # The old cabinet is solid physics. Enclose the apparent under-table
    # passages with fabricated safety/service panels at its actual boundary.
    for side in (-1,1):
        B('cabinet side safety enclosure',(side*1.38,.665,0),(.04,1.33,2.3),'graphite',0)
        B('cabinet front or rear closure',(0,.665,side*1.13),(2.72,1.33,.04),'graphite',0)
    # Recessed service panels explain the enclosure without suggesting a
    # traversable central span. They do not add holes through the solid proxy.
    for i in range(3):
        B(f'flush service cassette {i}',(-.85+i*.85,.74,1.1455),(.70,.73,.01),'enamel',.004)
    B('recessed under top rail', (0,1.17,-.02),(2.48,.17,1.94),'graphite')
    if kind == 'extract':
        supports = [(0,2.5)]
    elif kind in ('lookup','act'):
        supports = [(-.42,1.60),(.82,.72)]
    elif kind == 'rewrite':
        supports = [(-.94,.52),(.94,.52)]
    else:
        supports = [(-.9,.65),(.85,.75)]
    for index, (sx, width) in enumerate(supports):
        B(f'{index} isolated foot',(sx,.355,-.02),(width-.13,.11,1.70),'rubber',.04)
        crown(f'{name} | rolled pedestal {index}', (x+sx,0,z-.025), width, 1.86,
              [(.4,.05),(.46,0),(1.08,0),(1.13,.045)],static,'enamel')
        B(f'{index} recessed service gasket',(sx,.77,.925),(width-.10,.51,.034),'rubber',.025)
        B(f'{index} inset service face',(sx,.77,.95),(width-.17,.43,.035),'graphite',.025)
        B(f'{index} service grip slot',(sx,.88,.975),(max(.12,width-.32),.045,.02),'rubber',.015)
        if kind in ('lookup','act') and index == 0:
            for n in range(5):
                B(f'cooling fin {n}',(sx-.42+n*.21,.66,.982),(.07,.23,.025),'steel',.01)
    if kind in ('lookup','act'):
        for i in range(3):
            sx=-.7+i*.58
            T(f'seat {i} stem',(sx,1.36,-.2),(sx,1.49,-.2),.09,'steel')
            contact_housing(f'{name} | seat {i} contact pan',(x+sx,1.49,z-.2),(.43,.15,.48),static,'copper')
            contact_housing(f'{name} | seat {i} contact insert',(x+sx,1.59,z-.17),(.34,.08,.37),static,'rubber')
            B(f'seat {i} deep curved back',(sx,1.74,-.44),(.43,.46,.14),'enamel',.065)
            B(f'seat {i} inset back pad',(sx,1.75,-.35),(.31,.30,.045),'rubber',.035)
            B(f'seat {i} back contact crown',(sx,1.964,-.44),(.301,.012,.14),'enamel',0)
            B(f'seat {i} pad contact crown',(sx,1.896,-.35),(.217,.008,.045),'rubber',0)
            for side in (-1,1):
                T(f'seat {i} arm stem {side}',(sx+side*.21,1.5,-.03),(sx+side*.21,1.73,-.03),.025)
                T(f'seat {i} arm {side}',(sx+side*.21,1.73,-.38),(sx+side*.21,1.73,.06),.035)
        if kind=='lookup':
            contact_housing('Lookup | scanner contact crown',(x-1.04,1.67,z+.57),(.42,.64,.45),static,'enamel')
            T('scanner lens bezel',(-1.04,1.76,.77),(-1.04,1.76,.87),.14,'steel',24)
            T('scanner bezel hub',(-1.04,1.76,.87),(-1.04,1.76,.91),.0392,'graphite',16)
            T('scanner inset lens',(-1.04,1.77,.91),(-1.04,1.77,.94),.09,'cyan',24)
        else:
            # The old contact occupies this whole press body. Keep a visibly
            # enclosed gearbox; the real stamp works in front of it.
            contact_housing('Act | enclosed press gearbox',(x+.98,1.69,z-.4),(.48,.68,.65),static,'enamel')
            B('gearbox recessed service panel',(.98,1.72,-.068),(.30,.33,.014),'graphite',.006)
            T('press front wheel',(.98,1.72,-.07),(.98,1.72,.03),.20,'copper',24)
            T('press front wheel hub',(.98,1.72,.03),(.98,1.72,.07),.056,'steel',16)
            B('ticket support shoe',(.98,1.43,.21),(.35,.14,.36),'graphite',.02)
            B('ticket contact platen',(.98,1.50,.21),(.35,.035,.36),'ivory',0)
            for i in range(3): B(f'ticket print {i}',(.98,1.523,.10+i*.08),(.22,.012,.018),'graphite',0)
    elif kind=='plan':
        # Route rails rise out of a recessed map bed; the moving marker retains its path.
        B('flush route bed',(-.15,1.33,-.12),(1.98,.06,1.25),'graphite',0)
        for i,(sx,sz) in enumerate([(-.85,.25),(-.2,-.5),(.45,.25)]):
            contact_housing(f'Plan | waypoint {i} contact crown',(x+sx,1.41,z+sz),(.4,.14,.35),static,'copper')
            B(f'waypoint socket {i}',(sx,1.495,sz),(.22,.025,.2),'rubber',0)
        for dz in (-.55,.3): T('straight route guide',(-1.02,1.38,dz),(.82,1.38,dz),.035,'copper')
        for a,b in [((-.85,1.38,.25),(-.2,1.38,-.5)),((-.2,1.38,-.5),(.45,1.38,.25))]: T('route guide',a,b,.045,'steel')
        B('route drive console',(.98,1.65,-.55),(.4,.63,.42),'enamel',.08)
        B('route console contact crown',(.98,1.959,-.55),(.28,.012,.42),'enamel',0)
        T('route adjustment dial',(.98,1.70,-.33),(.98,1.70,-.29),.14,'copper',24)
    elif kind=='debug':
        B('service vice',(-.85,1.48,-.42),(.56,.28,.50),'graphite',.08)
        B('vice contact crown',(-.85,1.614,-.42),(.448,.012,.5),'graphite',0)
        for side in (-1,1): T('loop support',(-.85+side*.25,1.48,-.42),(-.85+side*.25,1.68,-.42),.045)
        loop=[(x-.85+.27*math.cos(a),1.84+.27*math.sin(a),z-.42) for a in np.linspace(0,math.pi*1.7,48)]
        tube('Debug | exposed copper repair loop',loop,.065,static,'copper',12)
        B('motor winding body',(.86,1.65,-.38),(.60,.64,.60),'enamel',.13)
        B('motor contact crown',(.86,1.964,-.38),(.42,.012,.60),'enamel',0)
        for i in range(3): B(f'motor louvre {i}',(.86,1.47+i*.14,-.066),(.40,.055,.035),'graphite',.02)
        T('motor bearing',(.86,1.91,-.08),(.86,1.91,-.04),.17,'copper',24)
        for dz in (-.22,.22): T('linear repair rail',(-.98,1.39,dz),(.65,1.39,dz),.035)
    elif kind=='rewrite':
        for dz in (-.65,.65):
            for dx in (-.95,.95):
                B('cast roller cheek',(dx,1.61,dz),(.22,.54,.34),'enamel',.09)
                B('roller cheek contact crown',(dx,1.874,dz),(.154,.012,.34),'enamel',0)
                T('bearing collar',(dx-.06,1.78,dz),(dx+.06,1.78,dz),.10,'graphite',20)
            T('copper roller barrel',(-.83,1.78,dz),(.83,1.78,dz),.15,'copper',32)
            T('roller axle',(-1.05,1.78,dz),(1.05,1.78,dz),.055,'steel',16)
        for dz in (-.94,.94):
            B('paper tray return',(0,1.375,dz),(1.55,.08,.36),'graphite',.035)
            B('paper tray steel insert',(0,1.43,dz),(1.2,.025,.30),'steel',0)
        T('feed gear hub',(-1.12,1.78,-.65),(-1.03,1.78,-.65),.25,'copper',28)
        T('feed gear recess',(-1.14,1.78,-.65),(-1.125,1.78,-.65),.14,'graphite',24)
        for i in range(3): B(f'paper stack {i}',(0,.53+i*.065,.33),(1.1,.045,.85),'ivory',.014)
    elif kind=='extract':
        for dx in (-.91,.91):
            B('guide carriage',(dx,1.76,-.73),(.28,.85,.45),'enamel',.085)
            B('guide contact crown',(dx,2.179,-.73),(.196,.012,.45),'enamel',0)
            T('vertical polished guide',(dx,1.40,-.46),(dx,2.10,-.46),.065)
        B('suspended separation head',(0,2.05,-.84),(2.08,.28,.25),'ivory',.085)
        B('head contact crown',(0,2.184,-.84),(1.968,.012,.25),'ivory',0)
        for i in range(3):
            dx=-.6+i*.55
            B(f'head slot {i}',(dx,2.05,-.727),(.35,.09,.025),'rubber',.03)
            B(f'receiver bed {i}',(dx,1.37,.34),(.47,.07,1.3),'rubber',0)
            for side in (-1,1): B(f'lane {i} contact cheek {side}',(dx+side*.245,1.42,.36),(.035,.16,1.3),'copper',0)
            B(f'receiver label inset {i}',(dx,1.425,.87),(.35,.035,.18),'ivory',0)
    else:
        # Intake: bearing channels with real returns and nine supported rollers.
        for center,outward,end in [(-.96,-1,-.85),(.52,1,.4)]:
            B('bearing channel web',(center,1.48,0),(.045,.28,1.65),'copper',.018)
            for height in (1.355,1.605): B('bearing channel folded return',(center,height,0),(.12,.03,1.65),'copper',0)
            for i in range(9):
                rz=-.6+i*.15
                T('roller bearing',(end,1.42,rz),(center,1.42,rz),.042,'graphite')
        for i in range(9): T(f'roller {i}',(-.85,1.42,-.6+i*.15),(.4,1.42,-.6+i*.15),.07,'steel',24)

    # Controls are seated into worktop, leaving the exact crank pivot free.
    B('lever pivot shoe',(.96,1.30,.75),(.25,.09,.24),'graphite',.035)
    T('lever pivot journal',(.84,1.30,.75),(1.08,1.30,.75),.06,'steel',20)
    # Overhead posts and rail contacts are exactly the old load path.
    for dx in (-1.15,1.15):
        T('overhead mast',(dx,.30,-.85),(dx,4.45,-.85),.10,'enamel',16)
        B('mast load shoe',(dx,.33,-.85),(.35,.08,.35),'copper',.025)
        T('sign stay',(dx,2.8,-.85),(dx,2.8,.30),.07)
    B('existing sign housing',(0,2.55,-.92),(2.8,.65,.18),'graphite',.05)
    B('light hood',(0,3.32,-.86),(2.65,.12,.28),'graphite',.04)
    branch=(x,3.65,z-.85)
    T('branch crossbar',(-1.25,3.65,-.85),(1.25,3.65,-.85),.13,'enamel',16)
    B('branch seated junction',(0,3.65,-.85),(.5,.46,.55),'enamel',.08)
    for side in (-1,1): B('junction polished jaw',(side*.27,3.65,-.85),(.09,.40,.48),'steel',.025)
    hub=(-16,3.65,67)
    # I section follows the exact prior radial branch line, with continuous flanges.
    direction=Vector(branch)-Vector(hub)
    side=Vector((-direction.z,0,direction.x)).normalized()
    for height in (-.11,.11):
        for offset in (-.09,.09):
            a=Vector(hub)+side*offset+Vector((0,height,0))
            b=Vector(branch)+side*offset+Vector((0,height,0))
            tube(f'{name} | radial flanged rail', [tuple(a),tuple(b)], .035,static,'steel',8)
    # The old radial physics is a filled 0.30m section. Give it a real closed
    # spine, with external flanges rather than a misleading hollow I gap.
    horizontal=Vector(branch)-Vector(hub)
    normal=Vector((-horizontal.z,0,horizontal.x)).normalized()*.15
    corners=[]
    for point in (Vector(hub),Vector(branch)):
        corners += [tuple(point+normal+Vector((0,.15,0))),tuple(point-normal+Vector((0,.15,0))),tuple(point-normal-Vector((0,.15,0))),tuple(point+normal-Vector((0,.15,0)))]
    mesh(f'{name} | closed radial rail contact spine',corners,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],static,'graphite',False)
    for dx in (-1.15,1.15):
        mid=tuple((a+b)/2 for a,b in zip(hub,branch))
        tube(f'{name} | tension stay',[(x+dx,4.45,z-.85),(mid[0],3.79,mid[2])],.035,static,'steel',8)


for kind,x,z in TOOLS:
    station(kind,x,z)

# Central supported switch hub and intact intake canopy/sign positions.
turned('Hub | cast switch drum',(-16,3.65,67),[(0,.46),(.04,.5),(.42,.5),(.46,.44)],static,'enamel')
turned('Hub | stainless lower ring',(-16,3.65,67),[(.08,.51),(.10,.55),(.14,.55),(.16,.51)],static,'steel')
turned('Hub | copper cover',(-16,3.65,67),[(.46,.33),(.49,.35),(.53,.30)],static,'copper')
for height,width,depth in [(3.6,5.3,.85),(4.5,5.3,.7)]:
    box('Intake | existing sign surround',(-16,height,74.245),(width+.16,depth+.12,.18),.05,static,'graphite')
box('Intake | header',(-16,4.92,74.15),(5.58,.14,.30),.04,static,'enamel')
for side in (-1,1):
    tube('Intake | canopy bracket',[(-16+side*1.15,4.45,72.15),(-16+side*1.15,4.95,74.245),(-16+side*1.15,3.2,74.245)],.055,static,'steel',12)
    box('Intake | sign outer post',(-16+side*2.73,4.19,74.20),(.115,1.46,.23),.035,static,'enamel')

# Clarification bell is an actual hollow turned bronze bell, with visible rim wall.
crown('Bell | enamel pedestal',(-18.5,0,73),.8,.8,[(.03,.07),(.1,0),(1.23,0),(1.285,.03)],static,'ivory')
box('Bell | full contact crown',(-18.5,1.2925,73),(.8,.015,.8),0,static,'ivory')
turned('Bell | stepped mounting shoe',(-18.5,1.30,73),[(0,.23),(.04,.25),(.07,.20)],static,'graphite',32)
turned('Bell | hollow bronze bell',(-18.5,1.32,73),[(0,.22),(.025,.235),(.06,.215),(.15,.16),(.29,.12),(.35,.07),(.35,.033),(.29,.084),(.15,.125),(.065,.177),(.035,.192),(0,.192)],static,'bronze',48)
tube('Bell | clapper stem',[(-18.5,1.62,73),(-18.5,1.38,73)],.018,static,'steel')
turned('Bell | clapper',(-18.5,1.35,73),[(0,.025),(.025,.045),(.06,.025)],static,'bronze',24)

carrier=owner('RequestCarrier')
# A raised cassette on two transport saddles clears the machinery at the old
# low hand-off root. The lower saddles fit the field-output gaps; their short
# contact feet rest on intake rollers z=0/.15 and clear outgoing paper later.
crown('Request | rounded raised document pan',(-.05,0,.27),.65,.23,[(.003,.035),(.04,0),(.21,0),(.235,.025)],carrier,'ivory')
crown('Request | pressed document lid',(-.05,0,.27),.57,.20,[(.225,.01),(.255,0),(.285,.03)],carrier,'enamel')
saddles=owner('RequestSaddles')
for sx in (-.325,.225):
    box('Request | transport saddle foot',(sx,-.1575,.15),(.018,.025,.13),0,saddles,'steel')
    box('Request | raised cassette saddle',(sx,-.055,.15),(.018,.18,.12),.006,saddles,'steel')
    box('Request | telescopic upper guide',(sx,.24,.15),(.032,.18,.13),.006,carrier,'ivory')
box('Request | cyan instruction window',(-.05,.30,.27),(.30,.02,.14),.008,carrier,'cyan')

lever=owner('ControlLever')
tube('Control | steel crank',[(0,0,0),(0,.34,-.13),(0,.42,-.17)],.055,lever,'steel',16)
tube('Control | molded copper grip',[(-.17,.42,-.17),(.17,.42,-.17)],.065,lever,'copper',24)
for side in (-1,1): tube('Control | grip end cap',[(side*.17,.42,-.17),(side*.184,.42,-.17)],.067,lever,'rubber',24)

for kind in ['lookup','plan','debug','rewrite','extract','act']:
    root=owner('Motion_'+kind)
    if kind=='lookup':
        path=[(.32*math.cos(a),0,-.30+.32*math.sin(a)) for a in np.linspace(0,math.tau,49)]
        tube('Lookup | polished moving scan ring',path,.045,root,'steel',12)
        path=[(.32*math.cos(a),.018,-.30+.32*math.sin(a)) for a in np.linspace(0,math.tau,49)]
        tube('Lookup | recessed cyan scan lens',path,.018,root,'cyan',10)
    elif kind=='act':
        # The root still descends 2.03 -> 1.63. Local geometry now works at
        # the right-front ticket, avoiding both the seat and gearbox wheel.
        # Ticket print top is 1.529, so final face local bottom is -.101.
        tube('Act | moving stamp handle',[(.83,0,.23),(1.13,0,.23)],.045,root,'steel')
        box('Act | descending stamp',(.98,-.037,.23),(.30,.10,.24),.035,root,'copper')
        box('Act | stamp contact face',(.98,-.094,.23),(.25,.014,.22),0,root,'rubber')
    elif kind in ('plan','debug'):
        front=.55 if kind=='debug' else -.25
        crown(kind+' | moving bearing carriage',(0,0,front),.35,.28,[(-.10,.03),(-.06,0),(.06,0),(.10,.025)],root,'copper')
        box(kind+' | tool cap',(-.05,.14,front),(.15,.13,.22),.045,root,'ivory')
        if kind=='debug':
            for sx in (-.12,.02):
                tube(kind+' | track wheel',[(sx-.025,-.175,.22),(sx+.025,-.175,.22)],.05,root,'steel',24)
                box('Debug | low cantilever wheel bridge',(sx,-.1125,.385),(.055,.025,.33),.008,root,'steel')
        else:
            box('Plan | waypoint contact shoe',(0,-.12125,0),(.20,.0425,.18),0,root,'rubber')
            box('Plan | cantilever over waypoint shoe',(0,-.08,-.125),(.16,.06,.25),.015,root,'copper')
            for side in (-1,1): tube(kind+' | small bearing',[(side*.14,-.02,-.35),(side*.14,-.02,-.15)],.035,root,'steel',12)
    elif kind=='extract':
        for i in range(3):
            box(f'Extract | output {i}',(-.6+i*.55,.02,0),(.4,.08,.45),.03,root,'ivory')
            box(f'Extract | output lens {i}',(-.6+i*.55,.065,0),(.29,.012,.22),.005,root,'cyan')
    else:
        # Thin stock is seated on the original tray top, rather than a thick
        # floating slab. Its upper printed surface is 1.4565 in world local Y.
        box('Rewrite | moving paper stock',(0,-.0815,0),(1.3,.012,.7),.004,root,'ivory')
        for i in range(3): box('Rewrite | printed line',(0,-.0745,-.2+i*.2),(.9,.002,.05),0,root,'graphite')

source_parts=sum(obj.type=='MESH' for obj in ASSET.objects)

# Independent shadow derivative, before saving the editable native source.
# Closed cabinets correspond to the actual visible safety enclosures. Above
# them, keep the machinery's open air gaps: no whole-station blocking box.
shadow=owner('ShadowWorkshop')
def SB(name,at,size):
    result=box('SHADOW | '+name,at,size,0,shadow,'rubber')
    result.display_type='WIRE'
    return result
def ST(name,a,b,radius,sides=8):
    result=tube('SHADOW | '+name,[a,b],radius,shadow,'rubber',sides)
    result.display_type='WIRE'
    return result
for kind,x,z in TOOLS:
    SB(kind+' foundation',(x,.15,z),(3.1,.3,2.65))
    SB(kind+' closed base',(x,.68,z),(2.8,1.36,2.3))
    for dx in (-1.15,1.15): ST(kind+' mast',(x+dx,.3,z-.85),(x+dx,4.45,z-.85),.1)
    SB(kind+' sign',(x,2.55,z-.92),(2.8,.65,.18))
    SB(kind+' light hood',(x,3.32,z-.86),(2.65,.12,.28))
    ST(kind+' crossbar',(x-1.25,3.65,z-.85),(x+1.25,3.65,z-.85),.13)
    ST(kind+' radial beam',(-16,3.65,67),(x,3.65,z-.85),.15,4)
    SB(kind+' seated junction',(x,3.65,z-.85),(.5,.46,.55))
    if kind in ('lookup','act'):
        for i in range(3):
            sx=x-.7+i*.58
            SB(kind+' seat pan',(sx,1.52,z-.2),(.43,.22,.48))
            SB(kind+' seat back',(sx,1.74,z-.44),(.43,.46,.14))
        if kind=='lookup': SB('scanner pedestal',(x-1.04,1.67,z+.57),(.42,.64,.45))
        else:
            SB('press gearbox',(x+.98,1.69,z-.4),(.48,.68,.65))
            ST('press wheel',(x+.98,1.72,z-.07),(x+.98,1.72,z+.07),.20,12)
            SB('ticket support',(x+.98,1.46,z+.21),(.35,.115,.36))
    elif kind=='plan':
        for sx,sz in [(-.85,.25),(-.2,-.5),(.45,.25)]: SB('waypoint',(x+sx,1.43,z+sz),(.4,.15,.35))
        SB('route console',(x+.98,1.65,z-.55),(.4,.63,.42))
    elif kind=='debug':
        SB('vice',(x-.85,1.48,z-.42),(.56,.28,.5))
        SB('motor',(x+.86,1.65,z-.38),(.6,.64,.6))
        points=[(x-.85+.27*math.cos(a),1.84+.27*math.sin(a),z-.42) for a in np.linspace(0,math.pi*1.7,12)]
        result=tube('SHADOW | debug open copper loop',points,.065,shadow,'rubber',6)
        result.display_type='WIRE'
    elif kind=='rewrite':
        for dz in (-.65,.65):
            ST('rewrite barrel',(x-.83,1.78,z+dz),(x+.83,1.78,z+dz),.15,12)
            for dx in (-.95,.95): SB('rewrite cheek',(x+dx,1.61,z+dz),(.22,.54,.34))
        for dz in (-.94,.94): SB('paper tray',(x,1.415,z+dz),(1.55,.055,.36))
    elif kind=='extract':
        for dx in (-.91,.91): SB('separator guide',(x+dx,1.76,z-.73),(.28,.85,.45))
        SB('separator head',(x,2.05,z-.84),(2.08,.28,.25))
        for i in range(3):
            dx=-.6+i*.55
            SB('receiver bed',(x+dx,1.37,z+.34),(.47,.07,1.3))
            for side in (-1,1): SB('receiver cheek',(x+dx+side*.245,1.42,z+.36),(.035,.16,1.3))
    else:
        for center in (-.96,.52): SB('intake bearing channel',(x+center,1.48,z),(.12,.28,1.65))
        for i in range(9): ST('intake roller',(x-.85,1.42,z-.6+i*.15),(x+.4,1.42,z-.6+i*.15),.07,8)
SB('bell pedestal',(-18.5,.65,73),(.8,1.3,.8))
ST('bell crown',(-18.5,1.3,73),(-18.5,1.67,73),.20,10)
ST('central hub',(-16,3.65,67),(-16,4.18,67),.5,12)
for height,size in [(3.6,(5.46,.97,.18)),(4.5,(5.46,.82,.18))]: SB('intake sign',(-16,height,74.245),size)
SB('intake header',(-16,4.92,74.15),(5.58,.14,.30))
for side in (-1,1):
    SB('intake sign post',(-16+side*2.73,4.19,74.20),(.115,1.46,.23))
    result=tube('SHADOW | canopy bracket',[(-16+side*1.15,4.45,72.15),(-16+side*1.15,4.95,74.245),(-16+side*1.15,3.2,74.245)],.055,shadow,'rubber',6)
    result.display_type='WIRE'
shadow_parts=sum(obj.type=='MESH' for obj in shadow.children)
bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
construction_bounds={}
for obj in ASSET.objects:
    if obj.type!='MESH': continue
    evaluated=obj.evaluated_get(depsgraph)
    points=[evaluated.matrix_world @ Vector(p) for p in evaluated.bound_box]
    game=[(p.x,p.z,-p.y) for p in points]
    construction_bounds[obj.name]={
        'root':obj.parent.name,
        'min':[min(p[i] for p in game) for i in range(3)],
        'max':[max(p[i] for p in game) for i in range(3)],
    }
(OUT/'construction-bounds.json').write_text(json.dumps(construction_bounds,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coaster-workshop-editable.blend'),compress=True)

# Apply only on the portable derivative. Collapse material slots after joining:
# repeated native parts keep one physical material primitive per movement root.
for root in OWNERS.values():
    parts=[obj for obj in root.children if obj.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        for modifier in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    if len(parts)>1: bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=root.name+'Surfaces'
    slots=list(obj.data.materials)
    unique=list(dict.fromkeys(slots))
    remap={i:unique.index(mat) for i,mat in enumerate(slots)}
    polygon_slots=[remap[polygon.material_index] for polygon in obj.data.polygons]
    obj.data.materials.clear()
    for mat in unique: obj.data.materials.append(mat)
    for polygon,index in zip(obj.data.polygons,polygon_slots): polygon.material_index=index

bpy.ops.object.select_all(action='DESELECT')
for obj in ASSET.objects: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'coaster-workshop.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
(OUT/'source-manifest.json').write_text(json.dumps({
    'baseline':'b75c474','blender':bpy.app.version_string,'units':'metres','front':'+Z','up':'+Y',
    'editableParts':source_parts,'shadowEditableParts':shadow_parts,'roots':list(OWNERS),'materials':[mat.name for mat in M.values()],
    'textures':{'source':'Deterministic authored procedural roughness, no external imagery','license':'Project-authored','size':[256,256]},
    'geometry':'Full source construction retained; no simplification or quality tier reduction',
    'acceptance':{'geometry':'pending verify.py','runtime':'not evaluated','visual':'not evaluated','performance':'not evaluated'}
},indent=2)+'\n')
print(f'WORKSHOP export complete: {source_parts} visible editable parts, {shadow_parts} shadow parts, {len(OWNERS)} roots',flush=True)
