"""Camp facility construction pass. Run only under the coordinator's heavy-work lock.

Blender --background --factory-startup --python build_camp.py -- --base-root <release> --out-root <checkout>
The existing generator is read-only construction input; actual baseline/native hashes are checked
before importing it. No output path can resolve into that checkout. All dimensions are metres.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--base-root', type=Path, default=Path('/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-djc-release'))
parser.add_argument('--out-root', type=Path, default=HERE.parents[3])
opts = parser.parse_args(ARGS)
BASE = opts.base_root.resolve()
OUT = opts.out_root.resolve()
if OUT == BASE or BASE in OUT.parents:
    raise RuntimeError('Output must not be the read-only baseline checkout')
ASSETS = OUT / 'public/assets/world/facility-craft/camp'
NATIVE = OUT / 'tools/world/facility-craft/camp/source'
ASSETS.mkdir(parents=True, exist_ok=True)
NATIVE.mkdir(parents=True, exist_ok=True)
for directory in (ASSETS, NATIVE):
    if BASE == directory.resolve() or BASE in directory.resolve().parents:
        raise RuntimeError('Refusing output through a baseline symlink')

contract = json.loads((HERE / 'baseline-contract.json').read_text())
for relative, expected in contract['files'].items():
    actual = hashlib.sha256((BASE / relative).read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f'Baseline changed: {relative}: {actual} != {expected}')
sys.path.insert(0, str(BASE / 'tools/world/camp-content'))
spec = importlib.util.spec_from_file_location('frozen_camp', BASE / 'tools/world/camp-content/build_assets.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
import cc_lib as lib
Part, box, strut, lathe, torus, sphere, xform = (base.Part, base.box, base.strut, base.lathe, base.torus, base.sphere, base.xform)
ids = ['C12', 'C13', 'C14', 'C15', 'C16']
record = {}


def rounded_box(a, b, radius, segments=3):
    bm = box(a, b)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=radius, offset_type='OFFSET',
                    segments=segments, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def path(part, points, radius, key, sides=8):
    for a, b in zip(points, points[1:]):
        part.add(strut(a, b, radius, radius, sides), key)


def closed_profile_lathe(profile, sides=32):
    """Revolve a closed non-axis vessel profile, without the solid end caps of the old helper."""
    bm=bmesh.new()
    rings=[[bm.verts.new((r*math.cos(i*math.tau/sides),r*math.sin(i*math.tau/sides),z)) for i in range(sides)] for r,z in profile]
    for a,b in zip(rings,rings[1:]+rings[:1]):
        for i in range(sides):
            j=(i+1)%sides; bm.faces.new((a[i],a[j],b[j],b[i]))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    return bm


def guitar(parts):
    """Replace the solid painted sound-hole with a closed resonant shell and open aperture."""
    old = parts[0]
    old.bm.free()
    body = Part('C12_guitar')
    outline = base.guitar_outline(26)
    n = len(outline)
    # Four nested surfaces: soundboard annulus, side rib, back, and cavity wall. The aperture
    # is genuinely empty; its inner edge joins a 3 mm soundboard, with the dark back visible.
    bm = bmesh.new()
    outer = [bm.verts.new((0.055, y, z)) for y, z in outline]
    inner = [bm.verts.new((0.055, 0.047 * math.cos(math.atan2(z - .4, y)), .4 + .047 * math.sin(math.atan2(z - .4, y)))) for y, z in outline]
    back_outer = [bm.verts.new((.052, y, z)) for y, z in outline]
    back_inner = [bm.verts.new((.052, v.co.y, v.co.z)) for v in inner]
    for i in range(n):
        j = (i + 1) % n
        for face in [(outer[i], outer[j], inner[j], inner[i]),
                     (back_outer[i], back_inner[i], back_inner[j], back_outer[j]),
                     (inner[i], inner[j], back_inner[j], back_inner[i]),
                     (outer[i], back_outer[i], back_outer[j], outer[j])]:
            bm.faces.new(face)
    body.add(bm, 'wood_light')
    # The body side is a real 4 mm rib shell, the back is a separate 5 mm plate.
    rib = bmesh.new()
    rings = [[rib.verts.new((x, y * scale, .3 + (z - .3) * scale)) for y, z in outline]
             for x, scale in [(-.05, 1), (.052, 1), (.052, .978), (-.05, .978)]]
    for i in range(n):
        j = (i + 1) % n
        for a, b in [(0, 1), (1, 2), (2, 3), (3, 0)]:
            rib.faces.new((rings[a][i], rings[a][j], rings[b][j], rings[b][i]))
    body.add(rib, 'wood_mid')
    body.add(base.outline_slab(outline, .005, .001, x0=-.0475), 'wood_dark')
    for x in [-.049, .053]:
        path(body, [(x, y*.995, z) for y, z in outline] + [(x, outline[0][0]*.995, outline[0][1])], .0025, 'paper', 6)
    for radius, thickness, key in [(.051, .0018, 'wood_dark'), (.057, .0014, 'paper'), (.061, .0014, 'wood_dark')]:
        body.add(xform(torus((0,0,0), radius, thickness, 40, 6, axis='X'), loc=(.055,0,.4)), key)
    # Neck heel is visibly joined into the upper bout; fret wire follows equal-temperament spacing.
    body.add(rounded_box((-.022,-.026,.55),(.046,.026,.97),.008), 'wood_mid')
    body.add(rounded_box((-.04,-.035,.53),(.045,.035,.65),.009), 'wood_mid')
    body.add(rounded_box((.043,-.027,.49),(.062,.027,.97),.002), 'wood_dark')
    for k in range(1, 17):
        z = .97 - .63 * (1 - 2 ** (-k/12))
        body.add(strut((.063,-.027,z),(.063,.027,z),.0012,.0012,6), 'steel')
    for k in [3,5,7,9,12]:
        z = .97 - .63 * (1 - 2 ** (-(k-.4)/12))
        body.add(strut((.062,-.002,z),(.063,-.002,z),.0022,.0022,10), 'paper')
    head = rounded_box((-.012,-.036,0),(.012,.036,.19),.006)
    body.add(xform(head, rot=('Y',math.radians(-13)), loc=(.038,0,.965)), 'wood_dark')
    for k in range(3):
        z = 1.015+k*.05
        x = .038-(z-.97)*math.tan(math.radians(13))
        for sign in [-1,1]:
            body.add(strut((x,sign*.026,z),(x,sign*.062,z),.006,.006,10),'steel')
            body.add(rounded_box((x-.007,sign*.062-.005,z-.01),(x+.007,sign*.062+.005,z+.01),.003),'brass')
            body.add(strut((x-.012,sign*.021,z),(x+.016,sign*.021,z),.005,.005,10),'steel')
    body.add(rounded_box((.053,-.07,.155),(.066,.07,.187),.004),'wood_dark')
    body.add(box((.065,-.047,.177),(.071,.047,.182)), 'paper')
    for i in range(6):
        body.add(strut((.066,-.04+i*.016,.165),(.072,-.04+i*.016,.165),.0027,.0027,8),'paper')
    # Transparent-free tortoiseshell pickguard uses a bounded plain warm pigment.
    pg = [(y,z) for y,z in [(.046,.30),(.12,.27),(.13,.33),(.09,.37),(.05,.36)]]
    slab = bmesh.new(); a=[slab.verts.new((.055,y,z)) for y,z in pg]; b=[slab.verts.new((.057,y,z)) for y,z in pg]
    slab.faces.new(list(reversed(a))); slab.faces.new(b)
    for i in range(len(pg)):
        j=(i+1)%len(pg); slab.faces.new((a[i],a[j],b[j],b[i]))
    body.add(slab,'canvas_edge')
    # The original stand and strings remain in their original leaned frame.
    xform(body.bm, rot=('Y',math.radians(-15)), loc=(0,0,.12))
    parts[0] = body
    return parts


def dumbbell(parts):
    grip = parts[0]
    height = .068 * math.cos(math.pi/6)
    # Raised machined diamond knurl, 0.6 mm high, in opposed helices over a 120 mm grip.
    # Fewer broad rings cannot explain grip; these intersecting helical ridges can.
    for sign in [-1,1]:
        for start in range(10):
            points=[]
            for k in range(17):
                y=-.065+.13*k/16
                theta=start*math.tau/10 + sign*y*math.tau/.09
                points.append((.0168*math.cos(theta),y,height+.0168*math.sin(theta)))
            path(grip,points,.0007,'steel',4)
        # Shoulder bearing/pressed sleeve at each head, ring around inset axial end plug.
        grip.add(strut((0,sign*.076,height),(0,sign*.093,height),.024,.028,16),'steel')
        grip.add(strut((0,sign*.165,height),(0,sign*.168,height),.041,.038,12,bevel=.001),'iron_dark')
        grip.add(strut((0,sign*.168,height),(0,sign*.169,height),.026,.026,16),'steel')
        grip.add(xform(torus((0,0,0),.033,.0018,18,5,axis='Y'),loc=(0,sign*.168,height)),'rubber')
    return parts


def stove(parts):
    body, wok = parts
    # Four bearing pads meet the existing grate crossbars; two side jambs and a stone lintel
    # make the front draft mouth a readable opening instead of a random ring of boulders.
    for x in [-.3,.3]:
        for y in [-.14,.14]:
            body.add(rounded_box((x-.036,y-.029,.278),(x+.036,y+.029,.306),.004),'iron_dark')
    for y in [-.205,.205]:
        body.add(rounded_box((.255,y-.046,.025),(.385,y+.046,.175),.012),'stone_dark')
    body.add(rounded_box((.25,-.26,.17),(.39,.26,.225),.014),'stone_top')
    body.add(rounded_box((.22,-.165,.012),(.4,.165,.026),.004),'stone_dark')
    # Restrained soot is an actual recessed refractory lining, not new light or flame.
    for y in [-.18,.18]:
        body.add(rounded_box((-.17,y-.012,.035),(.27,y+.012,.16),.003),'stone_dark')
    # Roll and ferrule explain the hollow bowl's edge and wooden handle connection.
    wz=.318
    wok.add(xform(torus((0,0,0),.255,.004,40,6),loc=(0,0,wz+.122)),'steel')
    wok.add(strut((0,-.31,wz+.124),(0,-.344,wz+.135),.023,.023,14),'steel')
    for y in [-.245,-.218]:
        wok.add(strut((.018,y,wz+.112),(.027,y,wz+.112),.004,.004,10),'steel')
    # End-grip hanging eye has an actual opening and follows the existing handle direction.
    wok.add(xform(torus((0,0,0),.011,.0025,14,5,axis='X'),loc=(0,-.555,wz+.20)),'iron_dark')
    return parts


def suitcase(parts):
    # Rebuild the shell as two mechanically separate rounded halves around an actual recessed
    # zipper race, retaining all original wheel/handle contacts and overall recognizable orange.
    old, handle = parts
    old.bm.free()
    shell=Part('C15_case')
    for xa,xb in [(-.13,-.006),(.006,.13)]:
        shell.add(rounded_box((xa,-.23,.06),(xb,.23,.68),.034),'canvas_orange')
    # Zipper web follows four edges around the mid-plane. No opaque plate crosses the case.
    path(shell,[(0,-.226,.095),(0,-.226,.645),(0,-.202,.674),(0,.202,.674),(0,.226,.645),(0,.226,.095),(0,.202,.066),(0,-.202,.066),(0,-.226,.095)],.006,'canvas_edge',8)
    for y in [-.231,.231]:
        for i in range(24):
            z=.104+i*.022
            shell.add(box((-.003,y-.002,z),(.003,y+.002,z+.006)),'steel')
    for z in [.069,.672]:
        for i in range(18):
            y=-.19+i*.022
            shell.add(box((-.003,y,z-.002),(.003,y+.006,z+.002)),'steel')
    # Double zip sliders and open pull rings end at the top accessible corner.
    for z in [.56,.605]:
        shell.add(rounded_box((-.012,.227,z),(.012,.239,z+.022),.003),'iron_dark')
        shell.add(xform(torus((0,0,0),.013,.0025,14,5,axis='Y'),loc=(0,.24,z-.01)),'steel')
    for x in [-.13,.13]:
        for y in [-.13,-.043,.043,.13]:
            # An 8 mm proud rib cannot take a 4 mm bevel: opposing bevels collapse at half
            # thickness. Keep a 4 mm broad central face and a real 2 mm edge radius.
            shell.add(rounded_box((x-.004,y-.011,.13),(x+.004,y+.011,.61),.002),'canvas_orange')
    for sx in [-1,1]:
        for sy in [-1,1]:
            x,y=sx*.085,sy*.18
            shell.add(rounded_box((x-.026,y-.025,.042),(x+.026,y+.025,.082),.007),'iron_dark')
            # Twin fork cheeks visibly straddle the tire and support the axle.
            for yy in [y-.019,y+.019]:
                shell.add(rounded_box((x-.019,yy-.004,.024),(x+.019,yy+.004,.061),.003),'iron_dark')
            shell.add(strut((x,y-.014,.029),(x,y+.014,.029),.029,.029,20,bevel=.003),'rubber')
            shell.add(strut((x,y-.024,.029),(x,y+.024,.029),.008,.008,10),'steel')
            shell.add(rounded_box((sx*.09-.025,sy*.205-.022,.055),(sx*.09+.025,sy*.205+.022,.13),.009),'rubber')
    for y in [-.1,.1]:
        shell.add(rounded_box((-.142,y-.016,.12),(-.126,y+.016,.66),.004),'iron_dark')
        handle.add(strut((-.134,y,.65),(-.134,y,.74),.0105,.0105,12),'steel')
        handle.add(xform(torus((0,0,0),.011,.002,12,4),loc=(-.134,y,.735)),'iron_dark')
    for y in [-.145,.145]:
        shell.add(rounded_box((-.036,y-.012,.671),(.036,y+.012,.686),.004),'iron_dark')
    shell.add(rounded_box((-.025,-.142,.684),(.025,.142,.706),.008),'rubber')
    # Side carrying handle with two mounts, a return gap and blank travel tag.
    for x in [-.048,.048]:
        shell.add(rounded_box((x-.01,.225,.381),(x+.01,.246,.414),.003),'iron_dark')
    shell.add(rounded_box((-.05,.244,.39),(.05,.267,.41),.007),'rubber')
    shell.add(box((-.004,.262,.30),(.004,.267,.397)),'canvas_slate')
    shell.add(rounded_box((-.03,.268,.25),(.03,.273,.315),.0015),'paper')
    parts[0]=shell
    return parts


def lantern(parts):
    # Keep the guard cage and fuel tank, but replace opaque blob with thin closed glass walls.
    old=parts[1]; old.bm.free()
    glass=Part('C16_glass')
    profile=[(.036,.094),(.058,.13),(.062,.165),(.05,.205),(.036,.225),
             (.034,.225),(.048,.205),(.060,.165),(.056,.13),(.034,.096)]
    glass.add(closed_profile_lathe(profile,32),'glass_warm')
    parts[0].bm.free()
    frame=Part('C16_frame')
    frame.add(lathe([(0,0),(.075,0),(.082,.012),(.082,.05),(.07,.065),(.045,.072),(.045,.085),(0,.085)],24),'iron_dark')
    frame.add(lathe([(0,.084),(.05,.084),(.052,.094),(0,.094)],24),'brass')
    for k in range(4):
        a=k*math.pi/2+math.pi/4
        points=[(r*math.cos(a),r*math.sin(a),z) for r,z in [(.054,.094),(.072,.13),(.075,.165),(.063,.205),(.05,.228)]]
        path(frame,points,.003,'iron',6)
    frame.add(xform(torus((0,0,0),.074,.0035,24,5),loc=(0,0,.16)),'iron')
    frame.add(lathe([(0,.222),(.05,.222),(.058,.232),(.04,.252),(.022,.261),(0,.261)],24),'iron_dark')
    for sign in [-1,1]:
        frame.add(strut((0,sign*.08,.04),(0,sign*.09,.04),.008,.008,10),'iron_dark')
    path(frame,[(0,.09*math.cos(i*math.pi/24),.04+.27*math.sin(i*math.pi/24)) for i in range(25)],.003,'iron',6)
    frame.add(strut((.045,0,.078),(.076,0,.078),.004,.004,8),'brass')
    frame.add(strut((.07,0,.078),(.076,0,.078),.011,.011,14),'brass')
    # A distinct wick/collar is visible inside the hollow globe. Emission is on this small wick,
    # not the whole glass; runtime preserves the existing warm/day-night level and ground pools.
    wick=Part('C16_wick')
    wick.add(lathe([(0,.096),(.019,.096),(.019,.115),(.009,.118),(0,.118)],16),'brass')
    wick.add(lathe([(0,.116),(.006,.116),(.009,.136),(.004,.151),(0,.156)],12),'wick')
    # Open ventilation stack: discrete ribs bridging two cap plates, with a real 8 mm gap.
    frame.add(lathe([(0,.259),(.022,.259),(.031,.268),(.033,.271),(.03,.274),(0,.274)],20),'iron_dark')
    for k in range(8):
        a=k*math.tau/8
        x,y=.025*math.cos(a),.025*math.sin(a)
        frame.add(strut((x,y,.272),(x,y,.284),.002,.002,6),'iron')
    frame.add(lathe([(0,.284),(.034,.284),(.036,.288),(.028,.294),(0,.296)],20),'iron_dark')
    # Fuel fill cap and knurled thumbwheel explain operation rather than decorative screws.
    frame.add(lathe([(0,0),(.013,0),(.014,.005),(.011,.009),(0,.009)],16,center=(.052,.018,.06)),'brass')
    for k in range(12):
        a=k*math.tau/12
        frame.add(strut((.072,.011*math.cos(a),.078+.011*math.sin(a)),(.076,.011*math.cos(a),.078+.011*math.sin(a)),.001,.001,4),'brass')
    parts[0]=frame; parts[1]=glass
    parts.append(wick)
    return parts


ENRICH = dict(C12=guitar,C13=dumbbell,C14=stove,C15=suitcase,C16=lantern)
MATERIAL_CLASSES = {
    'wood': (.60,.0), 'stone': (.94,.0), 'rubber': (.88,.0), 'paint': (.46,.0),
    'steel': (.30,.82), 'darkmetal': (.56,.55), 'brass': (.36,.72), 'glass': (.22,.05),
    'paper': (.9,.0), 'wick': (.80,.0),
}
materials = {}
lib.PALETTE['wick'] = ('#FFC978','light','cc_glow')


def mat_class(key):
    if key.startswith('wood'): return 'wood'
    if key.startswith('stone'): return 'stone'
    if key == 'rubber': return 'rubber'
    if key == 'steel': return 'steel'
    if key == 'brass': return 'brass'
    if key.startswith('iron'): return 'darkmetal'
    if key == 'glass_warm': return 'glass'
    if key in ['wick','paper']: return key
    return 'paint'


def physical_material(key):
    cls=mat_class(key)
    if cls in materials: return materials[cls]
    m=bpy.data.materials.new('camp_craft_'+cls); m.use_nodes=True
    bs=m.node_tree.nodes['Principled BSDF']
    color=m.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name='Col'
    m.node_tree.links.new(color.outputs['Color'],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value, bs.inputs['Metallic'].default_value=MATERIAL_CLASSES[cls]
    if cls=='glass':
        # Standard alpha blending and the shared environment, never transmission or an extra
        # offscreen scene render. The wick remains visible through the thin closed profile.
        bs.inputs['Alpha'].default_value=.25
        if hasattr(m,'surface_render_method'): m.surface_render_method='DITHERED'
        elif hasattr(m,'blend_method'): m.blend_method='BLEND'
        m['runtimePolicy']='thin honey-tinted reflective shade; alpha .25, no transmission'
    if cls=='wick':
        bs.inputs['Emission Color'].default_value=(1,.58,.20,1)
        bs.inputs['Emission Strength'].default_value=.12
    m['physicalClass']=cls; materials[cls]=m
    return m


def finalize(aid, parts, pivots=None, root_extras=None, part_extras=None, recentre=True):
    # Capture ORIGINAL recenter before improving anything. An added detail must never move the
    # acoustic guitar's stand, suitcase wheel contacts, stove pivot or tabletop lantern origin.
    lo,hi=lib._bounds(parts)
    shift=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z)) if recentre else Vector()
    parts=ENRICH[aid](parts)
    root=bpy.data.objects.new(aid,None); bpy.context.scene.collection.objects.link(root)
    root['assetId']=aid; root['units']='metres'; root['front']='+X'; root['source']='original authored refinement of frozen camp-content-r1'
    root['frozenRecenterBlender']=list(shift)
    for k,v in (root_extras or {}).items(): root[k]=v
    objects=[]
    for part in parts:
        pivot=(pivots or {}).get(part.name,Vector())
        is_pivot=part.name in (pivots or {})
        location=pivot+shift if is_pivot else Vector()
        xform(part.bm,loc=shift-location)
        mesh=bpy.data.meshes.new(part.name)
        keys=[part.keys[f[part.layer]] for f in part.bm.faces]
        part.bm.to_mesh(mesh); part.bm.free()
        cls_mats=[]
        for key in keys:
            mt=physical_material(key)
            if mt not in cls_mats: cls_mats.append(mt)
        for mt in cls_mats: mesh.materials.append(mt)
        colors=mesh.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
        mesh.color_attributes.active_color=colors; mesh.color_attributes.render_color_index=0
        for polygon,key in zip(mesh.polygons,keys):
            polygon.material_index=cls_mats.index(physical_material(key)); polygon.use_smooth=True
            rgba=lib.lin(lib.PALETTE[key][0])
            if key=='glass_warm': rgba=(.32,.22,.10,1)
            for loop in polygon.loop_indices: colors.data[loop].color=rgba
        mesh.set_sharp_from_angle(angle=math.radians(38))
        object=bpy.data.objects.new(part.name,mesh); bpy.context.scene.collection.objects.link(object)
        object.parent=root; object.location=location
        for k,v in (part_extras or {}).get(part.name,{}).items(): object[k]=v
        objects.append(object)
    record[aid]={'frozenRecenterBlender':list(shift),'root':root,'objects':objects}
    return root,objects,shift


base.finalize=finalize
base.export=lambda *_:None
lib.reset_scene()
for aid in ids:
    base.BUILDERS[aid]()
bpy.context.view_layer.update()
assets_collection=bpy.data.collections.new('CRAFT_ASSETS')
bpy.context.scene.collection.children.link(assets_collection)
for entry in record.values():
    for obj in [entry['root']]+entry['objects']:
        for collection in list(obj.users_collection): collection.objects.unlink(obj)
        assets_collection.objects.link(obj)
assets_collection['front']='+X (Blender and glTF), up +Z native / +Y GLB'
assets_collection['licence']='Original authored geometry; existing project camp-content geometry reused. No external textures or downloaded sources.'
bpy.ops.object.select_all(action='DESELECT')
for entry in record.values():
    for obj in [entry['root']]+entry['objects']: obj.select_set(True)
glb=ASSETS/'camp-facilities-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,
    export_yup=True,export_normals=True,export_materials='EXPORT',export_vertex_color='ACTIVE',
    export_texcoords=False,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)


def construction_name(aid,node,material,centre,extent,index):
    """Name connected shells by fabrication/use. These are source-only editable objects, never
    *additional* runtime meshes. Closely related small fittings can share a semantic object."""
    cls=material.removeprefix('camp_craft_')
    x,y,z=centre
    if aid=='C12':
        if node=='C12_strings': return 'six_strings'
        if node=='C12_stand': return 'stand_rubber_contacts' if cls=='rubber' else 'stand_frame_and_yoke'
        if cls=='wood':
            if extent.y>.3: return 'soundboard_with_open_aperture' if x>.04 else ('back_plate' if x<-.04 else 'bent_side_rib')
            if z>.97: return 'headstock'
            if z>.5: return 'neck_and_heel'
            if z<.25: return 'bridge'
            return 'rosette_inlay'
        if cls=='steel': return 'fret_wire' if z<.98 else 'tuning_posts'
        if cls=='brass': return 'tuning_buttons'
        if cls=='paper': return 'binding_saddle_nut_and_inlays'
        return 'pickguard'
    if aid=='C13':
        if cls=='rubber': return 'moulded_hex_head_and_end_ring'
        if abs(y)>.14: return 'inset_end_caps'
        if abs(y)>.073: return 'pressed_head_shoulders'
        return 'cross_knurled_steel_grip'
    if aid=='C14':
        if node=='C14_stove':
            if cls=='stone': return f'stacked_stone_{index:03d}' if z>.05 else 'ash_bed'
            if cls=='wood': return 'split_fuel_logs'
            if cls=='paint': return 'spent_embers'
            return 'grate_bars_and_bearing_pads'
        if cls=='wood': return 'wooden_handle_and_spatula_grip'
        if extent.x>.40 and extent.y>.40: return 'hollow_wok_bowl' if cls=='darkmetal' else 'rolled_rim'
        if y<-.30: return 'handle_socket_ferrule_and_hanging_eye'
        if y>.24: return 'helper_handle'
        return 'spatula_and_handle_rivets'
    if aid=='C15':
        if node=='C15_handle': return 'telescoping_handle_grip' if cls=='rubber' else 'telescoping_nested_tubes'
        if cls=='paint': return 'zipper_web' if abs(x)<.02 else ('front_shell_and_ribs' if x>0 else 'back_shell_and_ribs')
        if cls=='rubber': return 'spinner_tires' if z<.06 else ('corner_bumpers' if z<.15 else 'carry_handles')
        if cls=='paper': return 'blank_luggage_tag'
        if cls=='steel': return 'axles' if z<.06 else 'zipper_teeth_and_pulls'
        if z<.09: return 'spinner_forks'
        return 'handle_housings_and_mounts'
    if node=='C16_glass': return 'closed_thin_wall_globe'
    if node=='C16_wick': return 'burner_collar' if cls=='brass' else 'emissive_wick'
    if cls=='brass': return 'fuel_fill_cap_and_wick_adjuster'
    if z<.09: return 'fuel_tank_and_bail_lugs'
    if abs(x)<.005 and extent.x<.01: return 'arched_bail_handle'
    if z>.26: return 'ventilated_top_cap_and_ribs'
    if z>.22: return 'globe_top_shield'
    return 'wire_globe_guard'


construction=bpy.data.collections.new('SOURCE_CONSTRUCTION_EDITABLE')
bpy.context.scene.collection.children.link(construction)
for aid,entry in record.items():
    source_root=bpy.data.objects.new('SOURCE_'+aid,None); construction.objects.link(source_root)
    source_root['note']='Semantic editable parts. Export uses the hidden CRAFT_ASSETS batch copy.'
    for obj in entry['objects']:
        mesh=obj.data
        adjacency=[[] for _ in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices; adjacency[a].append(b); adjacency[b].append(a)
        visited=set(); groups={}; component=0
        material_by_vertex={vertex:mesh.materials[poly.material_index].name for poly in mesh.polygons for vertex in poly.vertices}
        for seed in range(len(mesh.vertices)):
            if seed in visited: continue
            stack=[seed]; visited.add(seed); members=[]
            while stack:
                vertex=stack.pop(); members.append(vertex)
                for neighbour in adjacency[vertex]:
                    if neighbour not in visited: visited.add(neighbour); stack.append(neighbour)
            points=[obj.matrix_world@mesh.vertices[i].co-Vector(entry['frozenRecenterBlender']) for i in members]
            if aid=='C12' and obj.name=='C12_guitar':
                points=[Matrix.Rotation(math.radians(15),3,'Y')@(p-Vector((0,0,.12))) for p in points]
            low=Vector([min(p[k] for p in points) for k in range(3)])
            high=Vector([max(p[k] for p in points) for k in range(3)])
            name=construction_name(aid,obj.name,material_by_vertex[seed],(low+high)*.5,high-low,component)
            groups.setdefault(name,set()).update(members); component+=1
        for name,members in groups.items():
            copy=mesh.copy(); bm=bmesh.new(); bm.from_mesh(copy); bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in members],context='VERTS')
            bm.to_mesh(copy); bm.free()
            source=bpy.data.objects.new(f'SOURCE_{aid}_{name}',copy); construction.objects.link(source)
            source.parent=source_root; source.matrix_world=obj.matrix_world.copy()
            source['constructionRole']=name; source['runtimeNode']=obj.name
# Native opens on the meaningful editable components. Review explicitly switches to the exact
# export batches; Blender's collection flags do not change what was selected for the GLB above.
assets_collection.hide_render=True; assets_collection.hide_viewport=True

# Actual native baseline objects are retained in their own hidden collection for source inspection.
# Review script uses the original GLB for baseline renders; this is never passed off as a screenshot.
baseline_collection=bpy.data.collections.new('BASELINE_NATIVE_READ_ONLY_COPY')
bpy.context.scene.collection.children.link(baseline_collection)
for aid in ids:
    source=BASE/'tools/world/camp-content/blend'/f'{aid}.blend'
    with bpy.data.libraries.load(str(source),link=False) as (src,dst):
        dst.objects=[name for name in src.objects if name==aid or name.startswith(aid+'_')]
    for obj in dst.objects:
        if obj is not None:
            obj.name='BASELINE_'+obj.name
            baseline_collection.objects.link(obj)
baseline_collection.hide_render=True; baseline_collection.hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE/'camp-facilities-source.blend'),compress=True)

manifest={'version':'camp-facilities-v1','blender':bpy.app.version_string,'units':'metres','front':'+X',
          'sourceLicence':assets_collection['licence'],'images':[],'textureBytes':0,'families':{},
          'glb':{'path':str(glb.relative_to(OUT)),'bytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest()}}
for aid,entry in record.items():
    points=[o.matrix_world@v.co for o in entry['objects'] for v in o.data.vertices]
    lo=Vector([min(v[k] for v in points) for k in range(3)]); hi=Vector([max(v[k] for v in points) for k in range(3)])
    triangles=0; degenerate=0; bad_faces=[]
    for o in entry['objects']:
        o.data.calc_loop_triangles(); triangles+=len(o.data.loop_triangles)
        for tri in o.data.loop_triangles:
            a,b,c=[o.data.vertices[i].co for i in tri.vertices]
            if (b-a).cross(c-a).length < 1e-12:
                degenerate+=1
                if len(bad_faces)<12:
                    bad_faces.append({'node':o.name,'centreLocal':list((a+b+c)/3),'material':o.data.materials[tri.material_index].name})
    if degenerate: raise RuntimeError(f'{aid}: {degenerate} degenerate triangles; samples={json.dumps(bad_faces)}')
    manifest['families'][aid]={'dimensionsGLB':[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y],
        'minGLB':[lo.x,lo.z,-hi.y],'maxGLB':[hi.x,hi.z,-lo.y], 'triangles':triangles,
        'materials':sorted(set(m.name for o in entry['objects'] for m in o.data.materials)),
        'meshNodes':[o.name for o in entry['objects']], 'frozenRecenterBlender':entry['frozenRecenterBlender']}
(ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'written':str(glb),'families':{a:m['triangles'] for a,m in manifest['families'].items()},'bytes':glb.stat().st_size}))
