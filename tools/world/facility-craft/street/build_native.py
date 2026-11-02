"""Exact TS-source geometry -> named editable Blender assets -> fresh GLB proof.

Run only under the primary executor's resource preflight and exclusive heavy-job lock:
  blender -b --python tools/world/facility-craft/street/build_native.py -- --only bench --render
  blender -b --python tools/world/facility-craft/street/build_native.py -- --render
No external textures; the runtime's live poster atlas is a neutral placeholder offline.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[4]
    parser.add_argument('--source-dir', type=Path, default=root / 'tools/world/facility-craft/street/source')
    parser.add_argument('--out', type=Path, default=root / 'public/assets/world/facility-craft/street')
    parser.add_argument('--native-dir', type=Path, default=root / 'tools/world/facility-craft/street/native')
    parser.add_argument('--review-dir', type=Path, default=root / 'docs/world/phase-2-playground/asset-batch5-20261102/street-review')
    parser.add_argument('--only', default='')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--resolution', type=int, default=640)
    parser.add_argument('--samples', type=int, default=16)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def convert(v):
    return (v[0], -v[2], v[1])


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


MATERIALS = {}


def material(signature):
    key = tuple(round(x, 5) for x in signature)
    if key in MATERIALS:
        return MATERIALS[key]
    roughness, metal, glow, sign = key
    m = bpy.data.materials.new('surface-r%s-m%s-glow%s-sign%s' % key)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    color = m.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Col'
    m.node_tree.links.new(color.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    m['runtimeGlow'] = int(glow)
    m['runtimeSign'] = int(sign)
    m['note'] = 'Live atlas and pausable signal clock remain in WorldStreetMaterial; offline preview uses fixed daytime/neutral atlas.'
    MATERIALS[key] = m
    return m


def set_night(night=False):
    for m in MATERIALS.values():
        p = m.node_tree.nodes.get('Principled BSDF')
        code = m['runtimeGlow']
        rgb, strength = (0, 0, 0, 1), 0
        if code == 1:
            rgb, strength = (1, .74, .42, 1), .05 + night * 2.4
        elif code == 2:
            rgb, strength = (.31, .82, .77, 1), .08 + night * .8
        elif 3 <= code <= 5:
            rgb = {3: (1, .22, .14, 1), 4: (1, .62, .16, 1), 5: (.3, 1, .55, 1)}[code]
            strength = .9 + night * 1.3 if code == 3 else .01
        elif code == 6:
            rgb, strength = (1, .8, .5, 1), night * .22
        elif code == 7:
            rgb, strength = (1, .93, .82, 1), .32 + night * .38
        p.inputs['Emission Color'].default_value = rgb
        p.inputs['Emission Strength'].default_value = strength


def add_nodes(data, collection, prefix):
    root = bpy.data.objects.new(prefix + '.ROOT', None)
    collection.objects.link(root)
    root['units'] = 'metres'
    root['sourceUp'] = '+Y'
    for node in data:
        for number, part in enumerate(node['parts']):
            lo, hi = part['start'], part['end']
            if hi <= lo:
                continue
            faces = [node['index'][i:i + 3] for i in range(0, len(node['index']), 3)
                     if lo <= node['index'][i] < hi]
            verts = [convert(node['position'][i * 3:i * 3 + 3]) for i in range(lo, hi)]
            mesh = bpy.data.meshes.new(f"{prefix}.{node['name']}.{part['name']}.{number}")
            mesh.from_pydata(verts, [], [[i - lo for i in face] for face in faces])
            mesh.update()
            obj = bpy.data.objects.new(mesh.name, mesh)
            collection.objects.link(obj)
            obj.parent = root
            obj.location = convert(node['translation'])
            obj['partName'] = part['name']
            obj['runtimeRoot'] = node['name']
            obj['baselineHullSHA256'] = node['baselineHullSHA256']
            obj['collision'] = 'Visual source only. Original runtime Builder proxy is unchanged.'
            colors = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
            colors.data.foreach_set('color', [c for i in range(lo, hi) for c in node['color'][i * 3:i * 3 + 3] + [1]])
            mesh.color_attributes.active_color_index = 0
            mesh.color_attributes.render_color_index = 0
            for name, component in [('runtimeRoughness', 0), ('runtimeMetalness', 1), ('runtimeGlow', 2), ('runtimeSign', 3)]:
                attribute = mesh.attributes.new(name=name, type='FLOAT', domain='POINT')
                attribute.data.foreach_set('value', node['aMat'][lo * 4 + component:hi * 4:4])
            uv = mesh.uv_layers.new(name='RuntimeAtlasUV')
            uv.data.foreach_set('uv', [c for loop in mesh.loops for c in node['aSuv'][(lo + loop.vertex_index) * 2:(lo + loop.vertex_index) * 2 + 2]])
            slots = {}
            for poly, face in zip(mesh.polygons, faces):
                sig = tuple(node['aMat'][face[0] * 4:face[0] * 4 + 4])
                if sig not in slots:
                    slots[sig] = len(mesh.materials)
                    mesh.materials.append(material(sig))
                poly.material_index = slots[sig]
                poly.use_smooth = True
            if hasattr(mesh, 'normals_split_custom_set_from_vertices'):
                mesh.normals_split_custom_set_from_vertices([convert(node['normal'][i * 3:i * 3 + 3]) for i in range(lo, hi)])
    return root


def bounds(collection):
    points = [obj.matrix_world @ Vector(corner) for obj in collection.all_objects if obj.type == 'MESH' for corner in obj.bound_box]
    return [[min(p[k] for p in points) for k in range(3)], [max(p[k] for p in points) for k in range(3)]]


def triangles(collection):
    return sum(len(obj.data.polygons) for obj in collection.all_objects if obj.type == 'MESH')


def visibility(collection, state):
    collection.hide_render = not state
    collection.hide_viewport = not state


def rig(scene, union, name, resolution, samples):
    low, high = map(Vector, union)
    centre = (low + high) * .5
    size = high - low
    span = max(size)
    direction = Vector((-1.15 if name in ['signal', 'shelter', 'bin'] else 1.05, 1.5, .95)).normalized()
    bpy.ops.object.camera_add(location=centre + direction * span * 2.7)
    camera = bpy.context.object
    camera.name = 'RIG.camera'
    camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * 1.42
    camera.data.lens = 50
    scene.camera = camera
    bpy.ops.mesh.primitive_plane_add(size=max(20, span * 8), location=(centre.x, centre.y, -.003))
    floor = bpy.context.object
    floor.name = 'RIG.ground'
    floor_mat = bpy.data.materials.new('RIG.ground-matte')
    floor_mat.diffuse_color = (.28, .30, .32, 1)
    floor.data.materials.append(floor_mat)
    lights = []
    for label, direction, power, colour in [
        ('key', (-3, 1, 5), 850, (1, .91, .80)),
        ('fill', (3, 2, 3), 500, (.77, .87, 1)),
        ('rim', (0, -3, 4), 600, (1, 1, 1)),
    ]:
        bpy.ops.object.light_add(type='AREA', location=centre + Vector(direction) * max(1, span * .55))
        light = bpy.context.object
        light.name = 'RIG.' + label
        light.data.energy = power * max(1, span * span * .2)
        light.data.shape = 'DISK'
        light.data.size = max(1, span * 1.3)
        light.data.color = colour
        light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler()
        lights.append(light)
    if scene.world is None:
        scene.world = bpy.data.worlds.new('RIG.world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.12, .14, .17, 1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .5
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    return {'camera': list(camera.location), 'rotation': list(camera.rotation_euler), 'orthoScale': camera.data.ortho_scale,
            'resolution': [resolution, resolution], 'samples': samples, 'viewTransform': scene.view_settings.view_transform,
            'look': scene.view_settings.look, 'exposure': 0,
            'lights': [{'name': l.name, 'location': list(l.location), 'rotation': list(l.rotation_euler), 'energy': l.data.energy,
                        'size': l.data.size, 'colour': list(l.data.color)} for l in lights]}


def main():
    args = arguments()
    args.out.mkdir(parents=True, exist_ok=True)
    args.native_dir.mkdir(parents=True, exist_ok=True)
    args.review_dir.mkdir(parents=True, exist_ok=True)
    selected = set(filter(None, args.only.split(',')))
    for source in sorted(args.source_dir.glob('*.source.json')):
        data = json.loads(source.read_text())
        name = data['id']
        if selected and name not in selected:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        MATERIALS.clear()
        scene = bpy.context.scene
        scene.unit_settings.system = 'METRIC'
        scene.unit_settings.scale_length = 1
        groups = {}
        for stage, key in [('baseline', 'baseline'), ('native', 'candidate')]:
            for lod in ['L0', 'L1']:
                col = bpy.data.collections.new(stage.upper() + '.' + lod)
                scene.collection.children.link(col)
                add_nodes(data[key][lod], col, name + '.' + stage + '.' + lod)
                groups[f'{stage}.{lod}'] = col
        bpy.context.view_layer.update()
        expected = triangles(groups['native.L0'])
        before = triangles(groups['baseline.L0'])
        native_bounds = bounds(groups['native.L0'])
        baseline_bounds = bounds(groups['baseline.L0'])
        union = [[min(native_bounds[0][k], baseline_bounds[0][k]) for k in range(3)],
                 [max(native_bounds[1][k], baseline_bounds[1][k]) for k in range(3)]]
        for col in groups.values():
            visibility(col, False)
        visibility(groups['native.L0'], True)
        set_night(False)
        rig_data = rig(scene, union, name, args.resolution, args.samples)
        native = args.native_dir / f'{name}.blend'
        scene['runtimeSourceSHA256'] = json.dumps(data['runtimeSourceSHA256'], sort_keys=True)
        scene['sourceJSONSHA256'] = sha(source)
        scene['notes'] = 'Editable named source parts. L1/baseline collections retained hidden. RIG objects are excluded from glTF. Live atlas is a neutral offline placeholder.'
        bpy.ops.wm.save_as_mainfile(filepath=str(native))
        bpy.ops.object.select_all(action='DESELECT')
        for obj in groups['native.L0'].all_objects:
            obj.select_set(True)
        glb = args.out / f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                                  export_yup=True, export_extras=True, export_attributes=True)
        # Fresh import into an isolated collection; it must reproduce geometry and world bounds.
        known = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(glb))
        fresh_objects = set(scene.objects) - known
        fresh = bpy.data.collections.new('FRESH.L0')
        scene.collection.children.link(fresh)
        for obj in fresh_objects:
            for col in list(obj.users_collection):
                col.objects.unlink(obj)
            fresh.objects.link(obj)
        groups['fresh.L0'] = fresh
        bpy.context.view_layer.update()
        fresh_bounds = bounds(fresh)
        actual = triangles(fresh)
        delta = max(abs(native_bounds[i][k] - fresh_bounds[i][k]) for i in range(2) for k in range(3))
        if actual != expected or delta > 2e-5:
            raise RuntimeError(f'{name}: fresh mismatch triangles {actual}/{expected}, bound delta {delta}')
        images = []
        if args.render:
            for stage in ['baseline', 'native', 'fresh']:
                for col in groups.values():
                    visibility(col, False)
                visibility(groups[stage + '.L0'], True)
                path = args.review_dir / f'{name}-{stage}.png'
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                images.append({'stage': stage, 'file': str(path), 'sha256': sha(path)})
            for col in groups.values():
                visibility(col, False)
            visibility(groups['native.L0'], True)
            clay = bpy.data.materials.new('RIG.construction-clay')
            clay.use_nodes = True
            clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.58, .58, .58, 1)
            clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .85
            scene.view_layers[0].material_override = clay
            path = args.review_dir / f'{name}-clay.png'
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            scene.view_layers[0].material_override = None
            images.append({'stage': 'clay', 'file': str(path), 'sha256': sha(path)})
        receipt = {'asset': name, 'sourceJSONSHA256': sha(source), 'runtimeSourceSHA256': data['runtimeSourceSHA256'],
                   'blend': {'file': str(native), 'sha256': sha(native)}, 'glb': {'file': str(glb), 'sha256': sha(glb), 'bytes': glb.stat().st_size},
                   'baselineTriangles': before, 'nativeTriangles': expected, 'freshTriangles': actual,
                   'nativeBoundsBlender': native_bounds, 'freshBoundsBlender': fresh_bounds, 'freshBoundsMaxDelta': delta,
                   'dimensionsMetres': [native_bounds[1][k] - native_bounds[0][k] for k in range(3)],
                   'nativeParts': len([o for o in groups['native.L0'].all_objects if o.type == 'MESH']),
                   'nativeMaterialResponses': len({m.name for obj in groups['native.L0'].all_objects if obj.type == 'MESH' for m in obj.data.materials}),
                   'renderer': bpy.app.version_string, 'rig': rig_data, 'images': images,
                   'status': 'generated; visual acceptance pending primary inspection',
                   'limitations': ['Runtime Builder geometry is authoritative; GLB is the fresh portable proof.',
                                   'Offline neutral poster placeholder and fixed signal state; runtime atlas/clock remain unchanged.',
                                   'No browser/performance/interaction acceptance is implied.']}
        (args.review_dir / f'{name}-receipt.json').write_text(json.dumps(receipt, indent=2))
        print(json.dumps({'asset': name, 'nativeTriangles': expected, 'freshTriangles': actual, 'boundsDelta': delta, 'renders': len(images)}))


if __name__ == '__main__':
    main()
