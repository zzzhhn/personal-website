"""G17 branch-led canopy study. Run Blender with --python-exit-code 1.

blender -b --factory-startup --python-exit-code 1 -P tools/world/facility-craft/nature/build_nature.py -- --render
Only writes this checkout's real facility-craft directory and batch5 evidence folder.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import sys

import bpy
from mathutils import Matrix, Vector

REPO = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
OUT = REPO / 'docs/world/phase-2-playground/asset-batch5-20261102'
PUBLIC = REPO / 'public/assets/world/facility-craft/nature'
COLOR = 'NaturePigment'
RNG = random.Random(17551)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fingerprint(ob):
    attr = ob.data.attributes.get('_WIND')
    return hashlib.sha256(json.dumps(dict(vertices=[list(v.co) for v in ob.data.vertices],
                                         polygons=[list(p.vertices) for p in ob.data.polygons],
                                         wind=[list(a.color) for a in attr.data])).encode()).hexdigest()


def lin(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (1, 1, 1, 1)
    mat.use_backface_culling = name.endswith('bark')
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0
    vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = COLOR
    mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def wind(co, branch, phase, flutter=0):
    return (max(0, min(1, co.z / 4.8)) ** 2, max(0, min(1, branch)), flutter,
            (phase + .5) / 8 if phase else 0)


class MeshData:
    def __init__(self):
        self.vertices, self.faces, self.weights, self.colors = [], [], [], []

    def point(self, co, weight, color):
        self.vertices.append(tuple(co))
        self.weights.append(tuple(weight))
        self.colors.append(tuple(color))
        return len(self.vertices) - 1

    def object(self, name, mat, collection, root, smooth=True):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        mesh.materials.append(mat)
        attr = mesh.attributes.new('_WIND', 'FLOAT_COLOR', 'POINT')
        for i, value in enumerate(self.weights):
            attr.data[i].color = value
        pigment = mesh.color_attributes.new(name=COLOR, type='FLOAT_COLOR', domain='CORNER')
        mesh.color_attributes.active_color = pigment
        for loop in mesh.loops:
            pigment.data[loop.index].color = (*self.colors[loop.vertex_index], 1)
        for poly in mesh.polygons:
            poly.use_smooth = smooth
        ob = bpy.data.objects.new(name, mesh)
        collection.objects.link(ob)
        ob.parent = root
        return ob


def catmull(points, radii, steps=4):
    result = []
    for i in range(len(points) - 1):
        a = points[i - 1] if i else points[i] * 2 - points[i + 1]
        b, c = points[i], points[i + 1]
        d = points[i + 2] if i + 2 < len(points) else c * 2 - b
        for k in range(steps):
            t = k / steps
            co = .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
            result.append((co, radii[i] * (1 - t) + radii[i + 1] * t))
    return result + [(points[-1], radii[-1])]


def interpolate(path, t):
    x = max(0, min(1, t)) * (len(path) - 1)
    i = min(len(path) - 2, int(x))
    return path[i][0].lerp(path[i + 1][0], x - i)


def tube(path, group, branch_start=0, sides=7):
    data = MeshData()
    bark = lin('5A4634')
    for j, (co, radius) in enumerate(path):
        tangent = path[min(j + 1, len(path) - 1)][0] - path[max(0, j - 1)][0]
        tangent.normalize()
        across = tangent.cross(Vector((0, 1, 0)))
        if across.length < .1:
            across = tangent.cross(Vector((1, 0, 0)))
        across.normalize()
        up = tangent.cross(across).normalized()
        for k in range(sides):
            angle = k * 2 * math.pi / sides
            # Longitudinal shallow flutes and taper explain bark structure without maps.
            flute = 1 + .065 * math.cos(3 * angle + .2) + .025 * math.cos(5 * angle)
            p = co + radius * flute * (math.cos(angle) * across + math.sin(angle) * up)
            t = j / (len(path) - 1)
            b = branch_start + (1 - branch_start) * t if group else 0
            factor = .96 + .065 * math.cos(3 * angle + .2)
            data.point(p, wind(p, b, group), [v * factor for v in bark])
            if j:
                a, b0, c, d = (j - 1) * sides + k, (j - 1) * sides + (k + 1) % sides, j * sides + k, j * sides + (k + 1) % sides
                data.faces.extend([(a, b0, d), (a, d, c)])
    # Closed caps; branch bases are embedded in their supporting parent tube.
    for k in range(1, sides - 1):
        data.faces.append((0, k + 1, k))
        a = (len(path) - 1) * sides
        data.faces.append((a, a + k, a + k + 1))
    return data


def add_leaf(data, base, axis, normal, length, width, group, branch, color, low=False):
    first_face = len(data.faces)
    axis = axis.normalized()
    normal = (normal - axis * axis.dot(normal)).normalized()
    side = axis.cross(normal).normalized()
    stations = [.30, .69] if low else [.17, .38, .62, .83]
    root = data.point(base, wind(base, branch, group, 0), [v * .77 for v in color])
    previous = None
    for t in stations:
        center = base + axis * length * t + normal * (math.sin(t * math.pi) * length * .065)
        half_width = width * .5 * math.sin(t * math.pi) ** .8
        ring = []
        for u in (-1, 0, 1):
            co = center + side * (half_width * u) + normal * (width * (.065 if u == 0 else -.035))
            factor = .86 + .18 * t + (.07 if u == 0 else 0)
            ring.append(data.point(co, wind(co, branch, group, t), [v * factor for v in color]))
        if previous is None:
            data.faces.extend([(root, ring[0], ring[1]), (root, ring[1], ring[2])])
        else:
            for j in (0, 1):
                data.faces.extend([(previous[j], ring[j], ring[j + 1]), (previous[j], ring[j + 1], previous[j + 1])])
        previous = ring
    co = base + axis * length - normal * width * .04
    tip = data.point(co, wind(co, branch, group, 1), [v * 1.035 for v in color])
    data.faces.extend([(previous[0], tip, previous[1]), (previous[1], tip, previous[2])])
    for i in range(first_face, len(data.faces)):
        data.faces[i] = tuple(reversed(data.faces[i]))


def sample_old_branch(trunk, group, t):
    attr = trunk.data.attributes['_WIND']
    phase = (group + .5) / 8
    candidates = [(abs(a.color[1] - t), v.co.copy()) for v, a in zip(trunk.data.vertices, attr.data)
                  if abs(a.color[3] - phase) < .003]
    assert candidates, ('Missing actual primary branch wind group', group)
    selected = sorted(candidates, key=lambda a: a[0])[:8]
    return sum((co for _, co in selected), Vector()) / len(selected)


def build_tree(source_trunk, source_crown, native, runtime, root, bark, leaf):
    attr = source_trunk.data.attributes['_WIND']
    foot = [v.co for v, a in zip(source_trunk.data.vertices, attr.data) if a.color[0] < 1e-8]
    base = sum(foot, Vector()) / len(foot)
    base.z = 0
    tips = {g: sample_old_branch(source_trunk, g, 1) for g in (1, 2, 3)}
    leader_tip = tips[1]
    trunk_points = [base + Vector((0, 0, -.025)), base + Vector((.025, -.02, .35)),
                    base + Vector((-.055, .035, 1.05)), base + Vector((-.08, .065, 1.65)),
                    base + Vector((.025, .09, 2.3)), leader_tip + Vector((-.045, .02, -.38)), leader_tip]
    main = catmull(trunk_points, [.33, .25, .205, .16, .115, .07, .042])
    wood_parts = [tube(main, 0, sides=10).object('G17.main_trunk_curved_taper', bark, native, root)]
    primary = {1: main}
    attachments = []
    for group, attach_t in ((2, .35), (3, .405)):
        start = interpolate(main, attach_t)
        p1, p2, p3 = [sample_old_branch(source_trunk, group, t) for t in (.36, .68, 1)]
        points = [start, p1 + Vector((.045 if group == 2 else -.065, 0, .02)), p2, p3]
        primary[group] = catmull(points, [.145 if group == 2 else .125, .10, .066, .035])
        wood_parts.append(tube(primary[group], group, sides=8).object(f'G17.primary_{group}_curved', bark, native, root))
        attachments.append(dict(part=f'primary_{group}', parent='main_trunk', centerlineDistance=0))
    crown_pts = [v.co for v in source_crown.data.vertices]
    lo, hi = [min(v[k] for v in crown_pts) for k in range(3)], [max(v[k] for v in crown_pts) for k in range(3)]
    high_leaves, low_leaves = [], []
    palettes = [lin('6F8A3A'), lin('8AA24A'), lin('A9B35A')]
    leaf_count = 0
    for group in (1, 2, 3):
        for j, at in enumerate((.43, .61, .79, .95)):
            # The leader is foliated only above its fork. Low side shoots are sparse.
            t = .57 + at * .40 if group == 1 else at
            a = interpolate(primary[group], t)
            radial = Vector((a.x - base.x, a.y - base.y, 0))
            if radial.length < .12:
                radial = Vector((math.cos(j * 1.9 + .4), math.sin(j * 1.9 + .4), 0))
            radial.normalize()
            lateral = Vector((-radial.y, radial.x, 0))
            direction = (radial * .65 + lateral * (.85 if j % 2 else -.85)).normalized()
            length = .55 + .105 * j
            end = a + direction * length + Vector((0, 0, .26 + .095 * j))
            for k in (0, 1):
                end[k] = max(lo[k] + .25, min(hi[k] - .25, end[k]))
            end.z = min(hi[2] - .36, end.z)
            mid = a.lerp(end, .48) + Vector((0, 0, .10))
            secondary = catmull([a, mid, end], [.041 - .004 * j, .019, .0055], steps=4)
            name = f'G17.branch_{group}_{j:02d}'
            wood_parts.append(tube(secondary, group, branch_start=t, sides=6).object(name, bark, native, root))
            attachments.append(dict(part=name, parent=f'primary_{group}', centerlineDistance=0))
            # R2: a volumetric branch-end mass, not a row of horizontal leaf trays.
            # Each curved twig terminates inside overlapping leaves. Ellipsoid axes
            # only distribute the supporting twigs; no sphere/core geometry is made.
            shoot_count = (7, 9, 12, 12)[j]
            cluster_center = end + Vector((0, 0, .12))
            cluster_axes = Vector((.43 + .035 * j, .36 + .04 * j, .49 + .055 * j))
            for s in range(shoot_count):
                at_s = .36 + (s % 5) / 4 * .61
                start = interpolate(secondary, at_s)
                azimuth = s * 2.399963 + group * .51 + j * 1.13
                z = -.65 + 1.57 * ((s * 5 % shoot_count) + .5) / shoot_count
                horizontal = math.sqrt(max(.05, 1 - z * z))
                local = (direction * (math.cos(azimuth) * horizontal)
                         + lateral * (math.sin(azimuth) * horizontal) + Vector((0, 0, z)))
                tip = cluster_center + Vector((local.x * cluster_axes.x, local.y * cluster_axes.y, local.z * cluster_axes.z)) * .79
                shoot_dir = (tip - start).normalized()
                shoot = catmull([start, start.lerp(tip, .55) + Vector((0, 0, .075)), tip], [.008, .0048, .0017], steps=3)
                wood_parts.append(tube(shoot, group, branch_start=min(1, t + .12), sides=5).object(f'{name}.twig_{s:02d}', bark, native, root))
                high, low = MeshData(), MeshData()
                # Rotate leaf pairs around the actual twig instead of assigning every
                # blade world-up. A roll varying along the rachis forms real upper,
                # side and downward-facing surfaces, including a dense shaded interior.
                across = shoot_dir.cross(Vector((0, 0, 1)))
                if across.length < .05:
                    across = shoot_dir.cross(Vector((0, 1, 0)))
                across.normalize()
                up = across.cross(shoot_dir).normalized()
                for pair, along in enumerate((.20, .36, .52, .68, .83, .94)):
                    pos = interpolate(shoot, along)
                    roll = (s % 4 - 1.5) * .47 + (along - .5) * .45
                    leaf_side = across * math.cos(roll) + up * math.sin(roll)
                    leaf_normal = (up * math.cos(roll) - across * math.sin(roll)).normalized()
                    for side in (-1, 1):
                        axis = (shoot_dir * .48 + leaf_side * side * .84 + leaf_normal * (.10 - .25 * along)).normalized()
                        normal = (leaf_normal + leaf_side * side * .15).normalized()
                        leaf_len = (.285 + .075 * RNG.random()) * (1 - .12 * along)
                        width = .14 + .035 * RNG.random()
                        color = palettes[(group + j + (1 if s > 2 else 0)) % 3]
                        add_leaf(high, pos, axis, normal, leaf_len, width, group, min(1, t + .2), color)
                        if pair in (1, 3, 5):
                            add_leaf(low, pos, axis, normal, leaf_len * 1.08, width * 1.12, group, min(1, t + .2), color, low=True)
                        leaf_count += 1
                color = palettes[(group + j) % 3]
                add_leaf(high, tip, shoot_dir, up, .25, .14, group, min(1, t + .2), color)
                add_leaf(low, tip, shoot_dir, up, .26, .16, group, min(1, t + .2), color, low=True)
                leaf_count += 1
                high_leaves.append(high.object(f'{name}.leaf_fan_{s:02d}', leaf, native, root))
                low_leaves.append(low.object(f'DERIVED.{name}.leaf_fan_{s:02d}', leaf, runtime, root))
    return wood_parts, high_leaves, low_leaves, dict(revision='R2-volume-after-rejected-flat-R1', leafBlades=leaf_count, primaryStems=3,
            secondaryBranches=12, leafFans=len(high_leaves), coreShells=0, attachments=attachments,
            sourceTrunkRetainedAsPhysicsReferenceOnly=True, visibleTrunkRebuilt=True,
            nativeParts=len(wood_parts) + len(high_leaves))


def merge(name, parts, mat, collection, root):
    data = MeshData()
    for ob in parts:
        mesh = ob.data
        offset = len(data.vertices)
        attr = mesh.attributes['_WIND']
        pigment = mesh.color_attributes[COLOR]
        by_vertex = {}
        for loop in mesh.loops:
            by_vertex[loop.vertex_index] = tuple(pigment.data[loop.index].color[:3])
        for v in mesh.vertices:
            data.point(ob.matrix_local @ v.co, attr.data[v.index].color, by_vertex[v.index])
        for poly in mesh.polygons:
            data.faces.append(tuple(offset + i for i in poly.vertices))
    return data.object(name, mat, collection, root)


def stats(objects):
    rows = {}
    for ob in objects:
        if ob.type != 'MESH':
            continue
        me = ob.data
        me.calc_loop_triangles()
        weights = me.attributes.get('_WIND') or me.attributes.get('_wind')
        assert weights and weights.domain == 'POINT', ('Missing four-channel wind', ob.name)
        pts = [ob.matrix_world @ v.co for v in me.vertices]
        assert all(math.isfinite(x) for p in pts for x in p), ('Nonfinite position', ob.name)
        assert all(math.isfinite(x) for w in weights.data for x in w.color), ('Nonfinite wind', ob.name)
        assert not any(t.area < 1e-12 for t in me.loop_triangles), ('Degenerate triangle', ob.name)
        rows[ob.name] = dict(triangles=len(me.loop_triangles), vertices=len(me.vertices),
                             bounds=[[min(p[k] for p in pts) for k in range(3)], [max(p[k] for p in pts) for k in range(3)]],
                             windRange=[[min(w.color[k] for w in weights.data), max(w.color[k] for w in weights.data)] for k in range(4)],
                             materials=[m.name for m in me.materials])
    return rows


def rig(objects, clay=False, view='medium'):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 3
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 900, 800, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform, scene.view_settings.look = 'Standard', 'None'
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    world = bpy.data.worlds.new('NATURE REVIEW world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .25, .28, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .45
    scene.world = world
    visible = set(objects)
    for ob in scene.objects:
        if ob.type == 'MESH':
            ob.hide_render = ob not in visible
    target = Vector((0, 0, 2.7 if view == 'medium' else 3.05))
    camera = bpy.data.objects.new('NATURE REVIEW camera', bpy.data.cameras.new('NATURE REVIEW camera'))
    scene.collection.objects.link(camera)
    camera.location = (7.5, -9.0, 4.7) if view == 'medium' else (4.6, -5.6, 3.8)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 6.2 if view == 'medium' else 4.1
    scene.camera = camera
    for name, position, energy, size in [('key', (3, -4, 8), 1100, 5), ('fill', (-4, -2, 5), 400, 4), ('rim', (1, 5, 7), 650, 4)]:
        light = bpy.data.lights.new('NATURE REVIEW ' + name, 'AREA')
        light.energy, light.shape, light.size = energy, 'DISK', size
        ob = bpy.data.objects.new(light.name, light)
        scene.collection.objects.link(ob)
        ob.location = position
        ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()
    if clay:
        mat = bpy.data.materials.get('NATURE REVIEW clay') or bpy.data.materials.new('NATURE REVIEW clay')
        mat.diffuse_color = (.47, .43, .36, 1)
        mat.use_nodes = True
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.47, .43, .36, 1)
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .85
        mat.use_backface_culling = False
        scene.view_layers[0].material_override = mat
    else:
        scene.view_layers[0].material_override = None
    return dict(camera=list(camera.location), target=list(target), orthoScale=camera.data.ortho_scale,
                resolution=[900, 800], samples=24, exposure=0, transform='Standard', look='None', clay=clay)


def render(objects, stage, clay=False, view='medium'):
    settings = rig(objects, clay=clay, view=view)
    path = OUT / f'G17-{stage}-{view}{"-clay" if clay else ""}.png'
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.context.scene.view_layers[0].material_override = None
    for ob in list(bpy.context.scene.objects):
        if ob.name.startswith('NATURE REVIEW '):
            bpy.data.objects.remove(ob, do_unlink=True)
    return dict(path=str(path.relative_to(REPO)), sha256=sha(path), rig=settings)


def export(root, meshes):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root] + meshes:
        ob.hide_set(False)
        ob.hide_viewport = False
        ob.hide_render = False
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC / 'G17.glb'), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True, export_extras=True,
        export_vertex_color='NAME', export_vertex_color_name=COLOR, export_all_vertex_colors=False,
        export_attributes=True, export_texcoords=False, export_tangents=False, export_animations=False,
        export_cameras=False, export_lights=False, export_skins=False, export_morph=False, export_image_format='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=20, export_draco_normal_quantization=12,
        export_draco_color_quantization=12, export_draco_generic_quantization=16)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-root', type=Path, default=REPO.parent / 'personal-world-djc-release')
    parser.add_argument('--render', action='store_true', help='Medium baseline/native/fresh plus matched clay pair')
    parser.add_argument('--close', action='store_true', help='Also render native/fresh close construction views')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    # Never write through a public overlay. Only the new actual directories are writable.
    for target in (PUBLIC, HERE / 'blend', OUT):
        for ancestor in (target, *target.parents):
            if ancestor == REPO:
                break
            assert not ancestor.is_symlink(), ('Refuse symlink output', ancestor)
        target.mkdir(parents=True, exist_ok=True)
    source = args.baseline_root / 'tools/world/nature-craft/blend/G17.blend'
    old_glb = args.baseline_root / 'public/assets/world/nature-craft/G17.glb'
    collision = args.baseline_root / 'public/assets/world/camp/G17.glb'
    collision_hash = sha(collision)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.preferences.filepaths.save_version = 0
    old_root = bpy.data.objects['G17']
    old_parts = [o for o in old_root.children_recursive if o.type == 'MESH']
    source_trunk = next(o for o in old_parts if 'trunk' in o.name)
    source_crown = next(o for o in old_parts if 'crown' in o.name)
    original_trunk_hash = fingerprint(source_trunk)
    report = dict(asset='G17', family='branch-led spreading tree, single review sample',
                  source=dict(native=str(source), sha256=sha(source), glb=str(old_glb), glbSha256=sha(old_glb), glbBytes=old_glb.stat().st_size),
                  collision=dict(path=str(collision), sha256=collision_hash, policy='runtime loads original camp/G17.glb; never candidate mesh'),
                  units='metres; native Z-up, GLB Y-up once', textures=0, renders=[], baseline=stats(old_parts),
                  approval='candidate; primary render review and browser day/night/motion acceptance pending')
    if args.render:
        report['renders'].append(render(old_parts, 'baseline'))
        report['renders'].append(render(old_parts, 'baseline', clay=True))
    baseline = bpy.data.collections.new('BASELINE batch4 source, reference only')
    bpy.context.scene.collection.children.link(baseline)
    for ob in [old_root] + old_parts:
        for collection in list(ob.users_collection):
            collection.objects.unlink(ob)
        baseline.objects.link(ob)
    old_root.name = 'BASELINE_G17'
    baseline.hide_render = True
    native = bpy.data.collections.new('G17 NATIVE editable branch and leaf fans')
    runtime = bpy.data.collections.new('G17 DERIVED LOD batches')
    bpy.context.scene.collection.children.link(native)
    bpy.context.scene.collection.children.link(runtime)
    root = bpy.data.objects.new('G17', None)
    native.objects.link(root)
    root.matrix_world = old_root.matrix_world.copy()
    root['assetId'], root['facilityCraft'] = 'G17', 'batch5-branch-canopy'
    root['windAttribute'] = '_WIND xyzw=bend,branch,leaf,phaseGroup'
    root['collisionPolicy'] = 'original /assets/world/camp/G17.glb, independent loader'
    root['lodDistanceMetres'] = 32
    bark, leaves = material('facility-G17-bark', .94), material('facility-G17-leaves', .80)
    wood, high, low, construction = build_tree(source_trunk, source_crown, native, runtime, root, bark, leaves)
    baked = [merge('L0_wood', wood, bark, runtime, root), merge('L0_leaves', high, leaves, runtime, root),
             merge('L1_wood', wood, bark, runtime, root), merge('L1_leaves', low, leaves, runtime, root)]
    # The editable close source is preserved. Only the far derived wood batch is
    # reduced, after material/attribute consolidation; wind groups stay per component.
    far_wood = baked[2]
    bpy.context.view_layer.objects.active = far_wood
    far_wood.select_set(True)
    reduce = far_wood.modifiers.new('Far branch silhouette only', 'DECIMATE')
    reduce.ratio = .42
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    far_wood.select_set(False)
    for ob in low:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.context.view_layer.update()
    report['construction'] = construction
    report['native'] = stats(wood + high)
    report['runtime'] = stats(baked)
    report['sourceTrunkReferenceHash'] = original_trunk_hash
    assert fingerprint(source_trunk) == original_trunk_hash, 'Original source reference modified'
    assert root.matrix_world == old_root.matrix_world, 'Root transform changed'
    export(root, baked)
    # Presentation and derived visibility are saved outside the editable asset parts.
    for ob in baked:
        ob.hide_render = True
    baseline.hide_viewport = True
    native_file = HERE / 'blend/G17.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(native_file))
    report['nativeFile'] = dict(path=str(native_file.relative_to(REPO)), sha256=sha(native_file))
    if args.render:
        report['renders'].append(render(wood + high, 'native'))
        report['renders'].append(render(wood + high, 'native', clay=True))
        if args.close:
            report['renders'].append(render(wood + high, 'native', view='close'))
    data = (PUBLIC / 'G17.glb').read_bytes()
    header = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    root_node = next(n for n in header['nodes'] if n.get('name') == 'G17')
    assert root_node.get('translation', [0, 0, 0]) == [0, 0, 0], 'Unexpected exported root translation'
    report['glb'] = dict(path=str((PUBLIC / 'G17.glb').relative_to(REPO)), sha256=sha(PUBLIC / 'G17.glb'), bytes=len(data),
                         nodes=len(header['nodes']), materials=len(header.get('materials', [])), textures=len(header.get('textures', [])),
                         root=root_node, drawsPerVisibleLod=2)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(PUBLIC / 'G17.glb'))
    imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    fresh = stats(imported)
    assert fresh.keys() == report['runtime'].keys(), 'Fresh LOD node names changed'
    for name, row in fresh.items():
        authored = report['runtime'][name]
        assert row['triangles'] == authored['triangles'], ('Fresh triangle mismatch', name)
        error = max(abs(row['bounds'][i][k] - authored['bounds'][i][k]) for i in range(2) for k in range(3))
        assert error < 5e-5, ('Fresh bounds', name, error)
        assert len([a for a in bpy.data.objects[name].data.color_attributes if not a.name.startswith('_')]), ('Missing COLOR_0', name)
        assert max(abs(row['windRange'][i][k] - authored['windRange'][i][k]) for i in range(4) for k in range(2)) < .001, ('Fresh wind ABI', name)
        row['boundsMaxErrorMetres'] = error
    report['freshGLB'] = fresh
    if args.render:
        near = [o for o in imported if o.name.startswith('L0_')]
        report['renders'].append(render(near, 'fresh'))
        if args.close:
            report['renders'].append(render(near, 'fresh', view='close'))
    assert sha(collision) == collision_hash, 'Original physics GLB changed'
    (OUT / 'nature-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print('NATURE_CRAFT_OK', json.dumps(dict(triangles={k: v['triangles'] for k, v in fresh.items()}, bytes=len(data), construction=construction)), flush=True)


if __name__ == '__main__':
    main()
