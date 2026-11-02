"""Batch6 rocks R9: a substantial visible joint and shoulder fracture in one body.

Blender -b -t 2 -P tools/world/nature-camp-craft/build_rocks.py -- --ids G21
Expand to --ids G22 G23 only after the representative is visually accepted.
The coordinator-owned shared_images helper externalizes three canonical image handles.
Importing this file does not load files, generate assets, or modify the scene.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / 'public/assets/world/nature-camp-craft'
NATIVE = HERE / 'blend'
REPORT = REPO / 'docs/world/phase-2-playground/asset-batch6-20261103/nature-camp'
DEFAULT_MAPS = REPO.parent / 'personal-world-bruno/static/bay/assets/coast-natural/pbr'
PROFILE = {
    'G21': {'dip': (.075, -.035), 'seams': [
        {'level': .355, 'below': .072, 'above': .029, 'depth': .088,
         'span': [-.78, .18], 'faultSide': -1},
        {'level': .635, 'below': .039, 'above': .018, 'depth': .043,
         'span': [-.20, .64], 'faultSide': 1}]},
    'G22': {'dip': (-.065, .045), 'seams': [
        {'level': .39, 'below': .069, 'above': .027, 'depth': .045,
         'span': [-.73, .15], 'faultSide': -1},
        {'level': .67, 'below': .034, 'above': .016, 'depth': .025,
         'span': [-.17, .59], 'faultSide': 1}]},
    # Both exposures lie above the existing 0.16m burial; the upper mass stays intact.
    'G23': {'dip': (.045, -.030), 'seams': [
        {'level': .55, 'below': .054, 'above': .024, 'depth': .022,
         'span': [-.72, .12], 'faultSide': -1},
        {'level': .73, 'below': .030, 'above': .015, 'depth': .011,
         'span': [-.16, .56], 'faultSide': 1}]},
}
REVISION = 'r9-visible-joint-and-shoulders'
HUMAN_CRITIQUE = '先改中尺度整体形体：层理穿过岩体并被局部断裂/缺口打断，厚薄、深浅和露出长度有依据的差异，不让每一层沿全周等距退台，不靠随机加噪声掩盖。保留承光大面、现有碰撞/占地边界与切面世界风格。一个自然的整体岩块比规则条带更重要，先修最大两块轮廓，再谈细纹。'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_record(path):
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def mesh_stats(objects):
    """World-space bounds plus welded aggregate topology (native parts are shell patches)."""
    objects = [o for o in objects if o.type == 'MESH']
    points, vertices, faces, offset = [], [], [], 0
    triangles = 0
    materials = set()
    for o in objects:
        o.data.calc_loop_triangles()
        triangles += len(o.data.loop_triangles)
        materials.update(m.name for m in o.data.materials if m)
        p = [o.matrix_world @ v.co for v in o.data.vertices]
        points.extend(p)
        vertices.extend(tuple(v) for v in p)
        faces.extend(tuple(i + offset for i in f.vertices) for f in o.data.polygons)
        offset += len(p)
    if not points:
        raise RuntimeError('No mesh geometry')
    me = bpy.data.meshes.new('__aggregate_check')
    me.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bm.normal_update()
    result = {
        'objects': len(objects), 'verticesIncludingPartSeams': len(vertices),
        'triangles': triangles, 'materials': sorted(materials),
        'boundsZUp': [[min(p[k] for p in points) for k in range(3)],
                      [max(p[k] for p in points) for k in range(3)]],
        'weldedBoundaryEdges': sum(e.is_boundary for e in bm.edges),
        'weldedNonmanifoldEdges': sum(not e.is_manifold for e in bm.edges),
        'degenerateFaces': sum(f.calc_area() < 1e-11 for f in bm.faces),
        'signedVolume': bm.calc_volume(signed=True),
        'finite': all(math.isfinite(v) for p in points for v in p),
    }
    bm.free()
    bpy.data.meshes.remove(me)
    return result


def validate(stats):
    assert stats['finite'], 'Nonfinite geometry'
    assert stats['weldedNonmanifoldEdges'] == 0, stats
    assert stats['degenerateFaces'] == 0, stats
    assert stats['signedVolume'] > 1e-6, 'Inverted/empty solid'


def glb_inventory(path):
    blob = path.read_bytes()
    assert blob[:4] == b'glTF'
    length, tag = struct.unpack_from('<I4s', blob, 12)
    assert tag == b'JSON'
    gltf = json.loads(blob[20:20 + length])
    primitives = [p for m in gltf.get('meshes', []) for p in m['primitives']]
    return {
        'triangles': sum(gltf['accessors'][p['indices']]['count'] // 3 for p in primitives),
        'primitiveCount': len(primitives),
        'materials': [{'name': m.get('name'), 'alphaMode': m.get('alphaMode', 'OPAQUE'),
                       'pbr': m.get('pbrMetallicRoughness', {}),
                       'normalTexture': m.get('normalTexture'),
                       'occlusionTexture': m.get('occlusionTexture'),
                       'extensions': m.get('extensions', {})}
                      for m in gltf.get('materials', [])],
        'images': [{'name': i.get('name'), 'mimeType': i.get('mimeType'), 'uri': i.get('uri'),
                    'embedded': 'bufferView' in i} for i in gltf.get('images', [])],
        'attributes': sorted(set(k for p in primitives for k in p['attributes'])),
        'nodes': [n.get('name') for n in gltf.get('nodes', [])],
        'extensionsUsed': gltf.get('extensionsUsed', []),
    }


def licensed_sources(folder):
    sources_path = folder / 'SOURCES.json'
    data = json.loads(sources_path.read_text())
    source = next(x for x in data['assets'] if x['family'] == 'stone')
    rows = []
    for name in ('stone-color.jpg', 'stone-normal.jpg', 'stone-arm.jpg'):
        p = folder / name
        published = next(m for m in source['maps'] if m['file'] == name)
        actual = file_record(p)
        assert actual['sha256'] == published['sha256'], f'Changed licensed map: {p}'
        rows.append({**actual, 'download': published['url'],
                     'asset': source['source'], 'authors': source['authors'],
                     'license': data['license'], 'licenseUrl': data['license_url']})
    return {'sourceManifest': file_record(sources_path), 'maps': rows}


def packed_photo(path, name, size, space):
    im = bpy.data.images.load(str(path), check_existing=False)
    im.name = name
    im.colorspace_settings.name = space  # Set BEFORE resize: avoid source pixel reload.
    im.scale(size, size)
    im.pack()
    return im


def generated_image(name, pixels, space='sRGB'):
    h, w = pixels.shape[:2]
    im = bpy.data.images.new(name, width=w, height=h, alpha=True)
    im.colorspace_settings.name = space
    im.pixels.foreach_set(np.asarray(pixels, dtype=np.float32).reshape(-1))
    im.file_format = 'PNG'
    im.pack()
    return im


def materials(folder):
    color = packed_photo(folder / 'stone-color.jpg', 'B6 | licensed mineral photograph input', 512, 'sRGB')
    rgba = np.empty(512 * 512 * 4, dtype=np.float32)
    color.pixels.foreach_get(rgba)
    rgb = rgba.reshape(512, 512, 4)[..., :3]
    lum = rgb @ np.array([.2126, .7152, .0722])
    ratio = np.clip(lum / max(float(lum.mean()), 1e-6), .35, 1.8)
    # Keep the photographed mineral and fracture contrast. R5 compressed this
    # almost to white then multiplied the inherited dark pigment a second time,
    # erasing the surface at ordinary player distance.
    neutral = np.ones((512, 512, 4), dtype=np.float32)
    neutral[..., :3] = np.clip(.70 + (ratio[..., None] - 1) * .30, .37, .94)
    # Retain a restrained warm mineral bias, without importing photographic light.
    chroma=rgb/np.maximum(lum[...,None],.025)
    neutral[..., :3] *= np.clip(1+(chroma-1)*.12,.95,1.05)
    color = generated_image('B6 | CC0 derived mineral fracture 512', neutral)
    normal = packed_photo(folder / 'stone-normal.jpg', 'B6 | CC0 rock normal 512', 512, 'Non-Color')
    arm = packed_photo(folder / 'stone-arm.jpg', 'B6 | CC0 rock ARM source 512', 512, 'Non-Color')
    p = np.empty(512 * 512 * 4, dtype=np.float32)
    arm.pixels.foreach_get(p)
    orm = p.reshape(512, 512, 4).copy()
    orm[..., 0] = 1.0  # Photographic shadowing is not geometry AO for this new shell.
    orm[..., 1] = .69 + .26 * orm[..., 1]
    orm[..., 2] = 0.0  # All three materials are nonmetallic stone.
    orm[..., 3] = 1.0
    arm = generated_image('B6 | authored ORM from CC0 roughness 512', orm, 'Non-Color')
    result = []
    for label, normal_strength, roughness_factor in [('mineral beds', .40, .94), ('recessed friable seams', .46, 1.0), ('cleaved shoulders', .32, .84)]:
        m = bpy.data.materials.new('B6 rock | ' + label)
        m.use_nodes = True
        m.diffuse_color = (.44, .43, .40, 1)
        m.use_backface_culling = True
        nodes, links = m.node_tree.nodes, m.node_tree.links
        bs = nodes.get('Principled BSDF')
        bs.inputs['Metallic'].default_value = 0
        bs.inputs['Roughness'].default_value = .87
        bs.inputs['Alpha'].default_value = 1
        tex = nodes.new('ShaderNodeTexImage'); tex.image = color
        vc = nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Mineral'
        mult = nodes.new('ShaderNodeMixRGB'); mult.blend_type = 'MULTIPLY'; mult.inputs[0].default_value = 1
        links.new(tex.outputs['Color'], mult.inputs[1]); links.new(vc.outputs['Color'], mult.inputs[2])
        links.new(mult.outputs[0], bs.inputs['Base Color'])
        nt = nodes.new('ShaderNodeTexImage'); nt.image = normal
        nm = nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        links.new(nt.outputs['Color'], nm.inputs['Color']); links.new(nm.outputs['Normal'], bs.inputs['Normal'])
        rt = nodes.new('ShaderNodeTexImage'); rt.image = arm
        separate = nodes.new('ShaderNodeSeparateColor'); separate.mode = 'RGB'
        links.new(rt.outputs['Color'], separate.inputs[0])
        factor = nodes.new('ShaderNodeMath'); factor.operation = 'MULTIPLY'
        factor.inputs[1].default_value = roughness_factor
        links.new(separate.outputs['Green'], factor.inputs[0])
        links.new(factor.outputs[0], bs.inputs['Roughness'])
        result.append(m)
    return result


def baseline_palette(objects):
    """Retain actual source pigment, taking the dominant physical material's corner color."""
    samples = {}
    for o in objects:
        attr = o.data.color_attributes.get('Bedding') or o.data.color_attributes.active_color
        for f in o.data.polygons:
            for li in f.loop_indices:
                if attr:
                    idx = li if attr.domain == 'CORNER' else o.data.loops[li].vertex_index
                    c = tuple(attr.data[idx].color[:3])
                else:
                    mat = o.data.materials[f.material_index]
                    bs = mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
                    c = tuple(bs.inputs['Base Color'].default_value[:3] if bs else mat.diffuse_color[:3])
                samples.setdefault(f.material_index, []).append(c)
    dominant = max(samples, key=lambda k: len(samples[k]))
    base = np.median(np.array(samples[dominant]), axis=0)
    assert all(.01 < float(v) < .95 for v in base), f'Unexpected baseline pigment {base}'
    return [float(v) for v in base]


def bedding_coordinate(p, center, dip):
    return p.z - dip[0] * (p.x - center.x) - dip[1] * (p.y - center.y)


def planar_groups(bm):
    """Find inherited fracture planes by area, without guessing them from a new hull."""
    groups = []
    for f in bm.faces:
        n = f.normal.copy()
        if abs(n.z) > .78 or Vector((n.x, n.y, 0)).length < .55:
            continue
        offset = n.dot(f.calc_center_median())
        group = next((g for g in groups if n.dot(g['normal']) > .9995
                      and abs(offset - g['offset']) < .006), None)
        if group is None:
            group = {'normal': n, 'offset': offset, 'area': 0, 'faces': []}
            groups.append(group)
        group['area'] += f.calc_area()
        group['faces'].append(f)
    return sorted(groups, key=lambda g: -g['area'])


def clamp01(value):
    return max(0.0, min(1.0, value))


def exposure_at(p, spec):
    """Two bounded weathered exposures; exactly zero on the other side of the mass.

    All masks are planar, piecewise linear geological boundaries. There is no
    polar angle, radial scaling, periodic pattern or noise in the deformation.
    """
    center = Vector(spec['center'])
    normal, tangent = Vector(spec['exposureNormal']), Vector(spec['exposureTangent'])
    delta = p - center
    s = delta.dot(normal) / spec['normalRadius']
    u = delta.dot(tangent) / spec['tangentRadius']
    # No deformation on the reverse 180 degrees, or on broad protected fractures.
    side = clamp01((s - .34) / .32)
    if side == 0:
        return 0.0
    q = bedding_coordinate(p, center, spec['dipXY'])
    fault = u + .24 * ((p.z - spec['zMin']) / spec['height'] - .5) - .035
    depth = 0.0
    for seam in spec['seams']:
        start, end = seam['span']
        extent = min(clamp01((u - start) / .16), clamp01((end - u) / .18))
        # A single oblique unweathered fracture separates/terminates both outcrops.
        termination = clamp01((seam['faultSide'] * fault - .045) / .12)
        dz = q - seam['levelZ']
        below, above = seam['belowMetres'], seam['aboveMetres']
        profile = clamp01(1 + dz / below) if dz < 0 else clamp01(1 - dz / above)
        depth = max(depth, seam['depth'] * side * extent * termination * profile)
    return depth


def body_fracture_at(p,spec):
    """A finite oblique joint and two unequal shoulder chips in one rock body.

    The plane crosses the body, rather than targeting a camera-facing source
    plane. Its ends stop within the mass; it is not a circumferential layer.
    """
    delta=p-Vector(spec['center']);h=spec['height'];t=(p.z-spec['zMin'])/h
    joint=spec['bodyJoint'];distance=delta.dot(Vector(joint['normal']))-joint['offset']
    ends=min(clamp01((t-.18)/.12),clamp01((.94-t)/.13))
    depth=joint['depth']*clamp01(1-abs(distance)/joint['halfWidth'])*ends
    for chip in spec['shoulderChips']:
        d=delta.dot(Vector(chip['normal']))
        region=clamp01((d-chip['start'])/(chip['full']-chip['start']))
        upper=min(clamp01((t-.43)/.15),clamp01((.96-t)/.11))
        depth=max(depth,chip['depth']*region*upper)
    return depth


def layer_shell(aid, originals, root):
    config = PROFILE[aid]
    vertices, faces = [], []
    inverse = root.matrix_world.inverted()
    for o in originals:
        matrix = inverse @ o.matrix_world
        offset = len(vertices)
        vertices.extend(tuple(matrix @ v.co) for v in o.data.vertices)
        faces.extend(tuple(i + offset for i in p.vertices) for p in o.data.polygons)
    me = bpy.data.meshes.new(aid + ' | baseline root-space copy')
    me.from_pydata(vertices, [], faces)
    bm = bmesh.new(); bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bm.normal_update()
    lo = Vector(tuple(min(v.co[k] for v in bm.verts) for k in range(3)))
    hi = Vector(tuple(max(v.co[k] for v in bm.verts) for k in range(3)))
    center = (lo + hi) * .5
    height = hi.z - lo.z
    # Extrema and the original contact belt are true original datums, not refitted boxes.
    anchors = {tuple(v.co) for v in bm.verts if any(abs(v.co[k] - edge[k]) < 1e-7
               for edge in (lo, hi) for k in range(3))}
    # Define the continuous recession direction on the original welded body.
    # Recomputing area-weighted directions after many tiny plane cuts gives
    # adjacent new vertices very different directions and folds the shell.
    # Native float layers interpolate this original field through each bisect.
    for name in ['recession_nx','recession_ny','recession_nz']:bm.verts.layers.float.new(name)
    direction_layers=[bm.verts.layers.float.get(name) for name in ['recession_nx','recession_ny','recession_nz']]
    for v in bm.verts:
        n=v.normal.copy()
        for axis,layer in enumerate(direction_layers):v[layer]=n[axis]
    # Allocate custom face storage before retaining BMFace handles. Blender 5.1
    # invalidates existing Python face wrappers when adding that layer.
    keep = bm.faces.layers.int.new('preserved_original_fracture')
    groups = planar_groups(bm)
    protected = []
    for group in groups:
        if all(group['normal'].dot(g['normal']) < .85 for g in protected):
            protected.append(group)
        if len(protected) == 2:
            break
    assert len(protected) == 2, 'Could not identify two original major fracture faces'
    for group in protected:
        for f in group['faces']:
            f[keep] = 1
    # These two planes are landmarks, not immutable vertex locks. R8D clay
    # proved that protecting every vertex kept the visible mass almost unchanged.
    exposed = next((g for g in groups if g not in protected and
                    all(g['normal'].dot(p['normal']) < .96 for p in protected)), None)
    assert exposed is not None, 'No independent weatherable source exposure'
    normal = Vector((exposed['normal'].x, exposed['normal'].y, 0)).normalized()
    tangent = Vector((-normal.y, normal.x, 0))
    nr = max(abs((v.co - center).dot(normal)) for v in bm.verts)
    tr = max(abs((v.co - center).dot(tangent)) for v in bm.verts)
    seams = [{**s, 'levelZ': lo.z + s['level'] * height,
              'belowMetres': s['below'] * height, 'aboveMetres': s['above'] * height}
             for s in config['seams']]
    spec = {'center': list(center), 'exposureNormal': list(normal),
            'exposureTangent': list(tangent), 'normalRadius': nr, 'tangentRadius': tr,
            'dipXY': config['dip'], 'zMin': lo.z, 'height': height, 'seams': seams}
    spec['bodyJoint']={'normal':list(Vector((.31,.88,.36)).normalized()),'offset':.015*height,'halfWidth':.115*height,'depth':.105*height}
    spec['shoulderChips']=[{'normal':list(Vector((-.60,.50,.62)).normalized()),'start':.18*height,'full':.28*height,'depth':.065*height},
                           {'normal':list(Vector((.68,-.40,.61)).normalized()),'start':.22*height,'full':.32*height,'depth':.040*height}]
    levels = [s['levelZ'] for s in seams]
    for seam in seams:
        for delta in (-seam['belowMetres'], 0, seam['aboveMetres']):
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                plane_co=(center.x, center.y, seam['levelZ'] + delta),
                plane_no=(-config['dip'][0], -config['dip'][1], 1), dist=1e-7)
    # Explicit exposure/fault boundaries create editable planar chips rather than
    # stretching coarse whole-face corners towards an unsupported radial profile.
    for fraction in (.34, .66):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=center + normal * nr * fraction, plane_no=normal, dist=1e-7)
    for fraction in sorted({v for seam in seams for v in seam['span']} | {-.13, .035, .20}):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=center + tangent * tr * fraction, plane_no=tangent, dist=1e-7)
    # The actual fault is oblique: u + .24 * normalized-height - .155 = 0.
    fault_normal = tangent / tr + Vector((0, 0, .24 / height))
    fault_center = center + tangent * tr * .035
    for offset in (-.045, .045):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=fault_center + fault_normal * (offset / fault_normal.length_squared),
            plane_no=fault_normal, dist=1e-7)
    joint=spec['bodyJoint'];jn=Vector(joint['normal'])
    for distance in [-joint['halfWidth'],-joint['halfWidth']*.45,0,joint['halfWidth']*.45,joint['halfWidth']]:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=center+jn*(joint['offset']+distance),plane_no=jn,dist=1e-7)
    for chip in spec['shoulderChips']:
        cn=Vector(chip['normal'])
        for distance in [chip['start'],chip['full']]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=center+cn*distance,plane_no=cn,dist=1e-7)
    for t in [.18,.30,.43,.58,.81,.94,.96]:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(center.x,center.y,lo.z+t*height),plane_no=(0,0,1),dist=1e-7)
    bm.normal_update()
    original_normals={v:Vector(tuple(v[layer] for layer in direction_layers)) for v in bm.verts}
    assert all(n.length>1e-5 for n in original_normals.values()),'Original recession direction field was lost during bisection'
    pre_positions = {v: v.co.copy() for v in bm.verts}
    original_protected = {v for f in bm.faces if f[keep] for v in f.verts}
    original_face_normals={f:f.normal.copy() for f in bm.faces}
    original_face_areas={f:f.calc_area() for f in bm.faces}
    max_move, moved_count = 0, 0
    original_contact = []
    for v in bm.verts:
        p = v.co.copy()
        if p.z <= lo.z + .12 * height or p.z >= lo.z + .96 * height:
            original_contact.append(tuple(p)); continue
        if tuple(p) in anchors:
            continue
        depth = max(exposure_at(p,spec),body_fracture_at(p,spec))
        # Preserve the actual six-way datums with a small continuous feather,
        # rather than leaving isolated untouched spikes inside a new fracture.
        depth*=min(1,min((p-Vector(a)).length for a in anchors)/(.08*height))
        if depth:
            d=original_normals[v].copy()
            if d.length > 1e-5:
                d.normalize()
                # Recession stays inside the fixed original envelope, including
                # concave source faces whose normals point into an old pocket.
                for axis in [0,1,2]:
                    if d[axis]>1e-8:depth=min(depth,max(0,(p[axis]-lo[axis])/d[axis]))
                    elif d[axis]<-1e-8:depth=min(depth,max(0,(hi[axis]-p[axis])/-d[axis]))
                v.co -= d * depth
                assert all(lo[k] - 1e-6 <= v.co[k] <= hi[k] + 1e-6 for k in range(3))
                max_move = max(max_move, depth)
                moved_count += 1
    assert moved_count > 0, 'Chosen exposure did not intersect the inherited shell'
    bm.normal_update()
    # At inherited concave corners, area-averaged recession directions can fold
    # tiny cut faces. Solve the recession subject to the original orientation,
    # attenuating only constrained corner vertices and one feather ring. This
    # is part of constructing the deformation, not exported-mesh repair.
    targets={v:v.co.copy() for v in bm.verts};alpha={v:1.0 for v in bm.verts}
    initial_dots=[f.normal.dot(original_face_normals[f]) for f in bm.faces]
    worst_initial=[{'dot':f.normal.dot(original_face_normals[f]),'sourceArea':original_face_areas[f],'sourceNormal':list(original_face_normals[f]),'proposedCenter':list(f.calc_center_median()),'onMajorFace':bool(f[keep])} for f in sorted(bm.faces,key=lambda f:f.normal.dot(original_face_normals[f]))[:8]]
    initial_bad=sum(d<.02 for d in initial_dots);iterations=0
    for iteration in range(32):
        bad=[f for f in bm.faces if f.normal.dot(original_face_normals[f])<.02]
        if not bad:break
        strong={v for f in bad for v in f.verts}
        feather={e.other_vert(v) for v in strong for e in v.link_edges}-strong
        for v in strong:alpha[v]*=.5
        for v in feather:alpha[v]*=.85
        for v in bm.verts:v.co=pre_positions[v]+(targets[v]-pre_positions[v])*alpha[v]
        bm.normal_update();iterations=iteration+1
    final_dot=min(f.normal.dot(original_face_normals[f]) for f in bm.faces)
    assert final_dot>=.02,'Recession could not preserve the original surface orientation'
    constrained=sum(a<.999 for v,a in alpha.items() if (targets[v]-pre_positions[v]).length>1e-8)
    proposed=sum((targets[v]-pre_positions[v]).length for v in bm.verts)
    orientation_diagnostic={'initialBadFaces':initial_bad,'initialMinimumDot':min(initial_dots),'worstInitialFaces':worst_initial,'iterations':iterations,'finalMinimumDot':final_dot,'constrainedMovingVertices':constrained,'vertices':len(alpha),'alphaHistogram':{str(cutoff):sum(a<cutoff for v,a in alpha.items() if (targets[v]-pre_positions[v]).length>1e-8) for cutoff in [.1,.5,.9,1]},'pointWeightedDisplacementRetained':sum((v.co-pre_positions[v]).length for v in bm.verts)/proposed,'actualMaxMovement':max((v.co-pre_positions[v]).length for v in bm.verts),'actualMajorFaceMaxMovement':max((v.co-pre_positions[v]).length for v in original_protected)}
    (REPORT/'R9-orientation-diagnostic.json').write_text(json.dumps(orientation_diagnostic,indent=2)+'\n')
    assert constrained/len(alpha)<.30,'Local orientation constraints erased too much of the intended fracture'
    solver={'initialInvertedOrNearTangentFaces':initial_bad,'initialMinimumNormalDot':min(initial_dots),'iterations':iterations,'constrainedMovingVertices':constrained,'shellVertices':len(alpha),'finalMinimumNormalDot':final_dot,'noFaceDeletionOrPostExportRepair':True}
    max_move=max((v.co-pre_positions[v]).length for v in bm.verts)
    max_horizontal_move=max(math.hypot(v.co.x-pre_positions[v].x,v.co.y-pre_positions[v].y) for v in bm.verts)
    moved_count=sum((v.co-pre_positions[v]).length>1e-8 for v in bm.verts)
    major_face_movement=max((v.co-pre_positions[v]).length for v in original_protected)
    assert major_face_movement>.01,'The new joint must actually change the inherited major faces'
    eroded_faces = [f for f in bm.faces if any((v.co - pre_positions[v]).length > 1e-8 for v in f.verts)]
    total_area = sum(f.calc_area() for f in bm.faces)
    moved_area = sum(f.calc_area() for f in eroded_faces)
    assert moved_area / total_area < .70, 'Fractures consumed too much of the single rock body'
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # Each polygon stays a planar facet; split any nonplanar cut polygon explicitly.
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.normal_update()
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    course_faces = [[] for _ in range(len(levels) + 1)]
    for f in bm.faces:
        q = bedding_coordinate(f.calc_center_median(), center, config['dip'])
        course_faces[sum(q > h for h in levels)].append({
            'vertices': tuple(v.index for v in f.verts), 'preserved': f[keep],
            'eroded': sum((v.co - pre_positions[v]).length for v in f.verts) / len(f.verts)})
    positions = [tuple(v.co) for v in bm.verts]
    bm.free()
    # The construction representation is named shell patches. Runtime welding below
    # restores the one connected closed shell, without buried slab interface faces.
    c = collection(aid + ' | editable bedding shell patches')
    parts = []
    for j, group in enumerate(course_faces):
        if not group:
            continue
        indices = sorted({i for f in group for i in f['vertices']})
        remap = {old: new for new, old in enumerate(indices)}
        mesh = bpy.data.meshes.new(f'{aid} bed {j + 1:02d} surface')
        mesh.from_pydata([positions[i] for i in indices], [], [tuple(remap[i] for i in f['vertices']) for f in group])
        mesh.update()
        exposure = mesh.attributes.new(name='local_erosion_metres', type='FLOAT', domain='FACE')
        preserved = mesh.attributes.new(name='original_fracture', type='INT', domain='FACE')
        for jface, row in enumerate(group):
            exposure.data[jface].value = row['eroded']
            preserved.data[jface].value = row['preserved']
        o = bpy.data.objects.new(f'{aid} | bed {j + 1:02d} | continuous shell patch', mesh)
        c.objects.link(o); o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4)
        o['construction'] = 'Editable open surface patch; adjacent named beds share exact welded boundaries'
        parts.append(o)
    assert max_move <= max([s['depth'] for s in seams]+[joint['depth']]+[s['depth'] for s in spec['shoulderChips']])+1e-6
    return parts, {'levelsZUp':levels,'dipXY':config['dip'],'maxHorizontalInsetMetres':max_horizontal_move,'maxSurfaceRecessionMetres':max_move,
                   'contactBeltZMax': lo.z + .12 * height, 'upperMassUntouchedZMin': lo.z + .96 * height,
                   'unchangedContactAndUpperVertices': len(original_contact),
                   'boundsRootZUp': [list(lo), list(hi)], 'originalExtremaAnchors': len(anchors),
                   'exposure': spec, 'movedVertexCount': moved_count, 'shellVertexCount': len(positions),
                   'erodedSurfaceAreaFraction': moved_area / total_area,
                   'originalMajorFractures': [{'normal': list(g['normal']), 'planeOffset': g['offset'],
                                          'area': g['area']} for g in protected],
                   'majorFaceVertexCount':len(original_protected),'majorFaceLocks':False,
                   'majorFaceMaxMovement':major_face_movement,
                   'orientationConstrainedRecession':solver,
                   'deformation':'Finite oblique whole-body joint and unequal shoulder chips; inherited-normal recession, fixed contact/extrema, no radial rings'},center


def finish_surfaces(parts, mats, base, construction, center, aid):
    def smooth(a,b,x):
        t=clamp01((x-a)/(b-a));return t*t*(3-2*t)
    # One oblique, uneven mineral bed crosses the entire body, displaced by an
    # oblique fault. It is continuous in object coordinates across face UV seams.
    # The exposed cleavages stay light; earth deposition belongs to the foot and
    # genuinely recessed faces, rather than a whole-object dark tint.
    height=construction['boundsRootZUp'][1][2]-construction['boundsRootZUp'][0][2]
    bottom=construction['boundsRootZUp'][0][2]
    inherited=np.array(base)/np.mean(base)
    for o in parts:
        for m in mats:
            o.data.materials.append(m)
        uv = o.data.uv_layers.new(name='MineralUV')
        colors = o.data.color_attributes.new(name='Mineral', type='FLOAT_COLOR', domain='CORNER')
        o.data.color_attributes.active_color = colors
        for f in o.data.polygons:
            erosion = o.data.attributes['local_erosion_metres'].data[f.index].value
            protected = o.data.attributes['original_fracture'].data[f.index].value
            role = 1 if erosion > construction['maxHorizontalInsetMetres'] * .23 and abs(f.normal.z) < .65 else 2 if f.normal.z > .46 else 0
            f.material_index = role
            f.use_smooth = False
            axes = [k for k in range(3) if k != max(range(3), key=lambda k: abs(f.normal[k]))]
            for li in f.loop_indices:
                v = o.data.vertices[o.data.loops[li].vertex_index].co
                # Face-oriented physical UV avoids collapsed vertical projections.
                uv.data[li].uv = (v[axes[0]] / 1.65 + .17, v[axes[1]] / 1.65 + .31)
                delta=v-center
                fault=smooth(-.08,.08,delta.x+.43*delta.y)
                q=(v.z-bottom-.24*delta.x+.14*delta.y)/height-.105*fault
                thickness=.055*clamp01((delta.x-delta.y+.6)/1.2)
                mineral=smooth(.40,.51,q)*(1-smooth(.70+thickness,.81+thickness,q))
                pigment=np.array([.64,.63,.59])*(1-mineral)+np.array([.94,.92,.85])*mineral
                pigment*=1+(inherited-1)*.10
                if role==2:pigment*=np.array([1.06,1.05,1.03])
                if role==1:pigment=pigment*.77+np.array([.10,.085,.06])
                deposit=(1-smooth(.07,.23,(v.z-bottom)/height))*.32
                pigment=pigment*(1-deposit)+np.array([.43,.37,.28])*deposit
                colors.data[li].color=tuple(np.clip(pigment,.22,.98))+(1,)


def bake_cavity_ao(parts):
    """Short-range geometry-only AO on independent UV1, with UV0 left intact.

    Unwrap a welded native proxy, before glTF splits the normal/UV seams. Copy
    only UV1 back to the named native patches. No lights, ground or paint enters
    this map; the original photographed color/normal/roughness keep UV0.
    """
    vertices,faces,roles=[],[],[]
    for ob in parts:
        offset=len(vertices)
        vertices.extend(tuple(ob.matrix_world@v.co) for v in ob.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in ob.data.polygons)
        roles.extend(p.material_index for p in ob.data.polygons)
    me=bpy.data.meshes.new('Rock AO welded native proxy')
    me.from_pydata(vertices,[],faces);me.update()
    for mat in parts[0].data.materials:me.materials.append(mat)
    for poly,role in zip(me.polygons,roles):poly.material_index=role
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(me);bm.free();me.update()
    proxy=bpy.data.objects.new('BAKE ONLY | welded rock',me);bpy.context.collection.objects.link(proxy)
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
    uv=me.uv_layers.new(name='UV1_AO')
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=0)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=3/512)
    bpy.ops.object.mode_set(mode='OBJECT')
    me=proxy.data;uv=me.uv_layers['UV1_AO']
    me.calc_loop_triangles()
    area=sum(abs((uv.data[t.loops[1]].uv-uv.data[t.loops[0]].uv).cross(uv.data[t.loops[2]].uv-uv.data[t.loops[0]].uv))*.5 for t in me.loop_triangles)
    assert .30<area<1.01,('Unusable AO atlas coverage',area)
    def point_key(v):return tuple(round(float(n),6) for n in v)
    def face_key(ob,p):return tuple(sorted(point_key(ob.matrix_world@ob.data.vertices[i].co) for i in p.vertices))
    transfer={face_key(proxy,p):{point_key(me.vertices[me.loops[li].vertex_index].co):tuple(uv.data[li].uv) for li in p.loop_indices} for p in me.polygons}
    for ob in parts:
        ao=ob.data.uv_layers.new(name='UV1_AO')
        for poly in ob.data.polygons:
            source=transfer[face_key(ob,poly)]
            for li in poly.loop_indices:ao.data[li].uv=source[point_key(ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co)]
        ob.data.uv_layers.active_index=0;ob.data.uv_layers[0].active_render=True
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64
    scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.bake.margin=3
    if hasattr(scene.render.bake,'margin_type'):scene.render.bake.margin_type='EXTEND'
    image=bpy.data.images.new('B6 | rock short range cavity AO UV1',width=512,height=512,alpha=False)
    image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    state=[]
    hidden=[(ob,ob.hide_render) for ob in parts]
    for ob,_ in hidden:ob.hide_render=True
    for mat in me.materials:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');source=output.inputs['Surface'].links[0].from_socket
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=True;ao.inside=False;ao.samples=16;ao.inputs['Distance'].default_value=.24
        emission=nodes.new('ShaderNodeEmission');links.new(ao.outputs['AO'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
        target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        state.append((mat,output,source,ao,emission,target))
    bpy.ops.object.bake(type='EMIT',use_clear=False)
    pixels=np.empty(512*512*4,np.float32);image.pixels.foreach_get(pixels);values=pixels.reshape(512,512,4)[...,0]
    samples=[];exposed=[];zmax=max(v.co.z for v in me.vertices);zmin=min(v.co.z for v in me.vertices)
    top_face_center=max(tri.center.z for tri in me.loop_triangles if tri.normal.z>.35)
    for tri in me.loop_triangles:
        p=sum((uv.data[li].uv for li in tri.loops),Vector((0,0)))/3
        value=float(values[min(511,int(p.y*512)),min(511,int(p.x*512))]);samples.append(value)
        if tri.center.z>top_face_center-.07*(zmax-zmin) and tri.normal.z>.35:exposed.append(value)
    assert min(samples)<.98 and exposed and np.mean(exposed)>.92,('AO must preserve exposed cap and affect real crevices',min(samples),exposed)
    image.pack()
    for mat,output,source,ao,emission,target in state:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;links.new(source,output.inputs['Surface']);nodes.remove(ao);nodes.remove(emission)
        uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='UV1_AO';links.new(uvnode.outputs['UV'],target.inputs['Vector'])
        target.label='Geometry AO exported independently on UV1'
        mat['batch6AO']='Packed short-range AO image on UV1_AO; attached as independent glTF occlusionTexture after PBR export'
    for ob,hide in hidden:ob.hide_render=hide
    bpy.data.objects.remove(proxy,do_unlink=True)
    return {'size':[512,512],'distanceMetres':.24,'cyclesSamples':64,'nodeSamples':16,'onlyLocal':True,'UVChannel':1,'atlasCoverage':area,'triangleCenterAO':{'min':min(samples),'mean':float(np.mean(samples)),'p10':float(np.percentile(samples,10))},'exposedCap':{'samples':len(exposed),'mean':float(np.mean(exposed))},'content':'Geometry-only ambient occlusion; no directional lights or painted shadows; original UV0/PBR retained'},image


def attach_cavity_ao(path,image):
    # Same independent-UV1 packaging used by the accepted daybed parity path.
    # Blender 5.1 otherwise combines same-size AO/roughness images as ORM;
    # keeping this atlas separate protects the photographed roughness on UV0.
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    data=json.loads(raw[20:20+length]);binary=raw[28+length:]
    binary+=b'\0'*((-len(binary))%4);payload=bytes(image.packed_file.data)
    assert payload.startswith(b'\x89PNG\r\n\x1a\n'), 'AO payload must be a real packed PNG'
    view=len(data['bufferViews']);data['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(payload)})
    image_id=len(data['images']);data['images'].append({'name':'B6 rock geometry AO UV1','mimeType':'image/png','bufferView':view})
    sampler=len(data.setdefault('samplers',[]));data['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071})
    texture=len(data['textures']);data['textures'].append({'source':image_id,'sampler':sampler})
    for mat in data['materials']:mat['occlusionTexture']={'index':texture,'texCoord':1,'strength':1.0}
    assert all('TEXCOORD_1' in p['attributes'] for mesh in data['meshes'] for p in mesh['primitives'])
    binary+=payload;data['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(data,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)


def runtime_shell(parts):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = 'rock'
    bm = bmesh.new(); bm.from_mesh(merged.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(merged.data); bm.free(); merged.data.update()
    return merged


def render_review(objects, path, distance):
    """Optional neutral evidence, never a substitute for final engine visual acceptance."""
    scene = bpy.context.scene
    stats = mesh_stats(objects)
    lo, hi = [Vector(v) for v in stats['boundsZUp']]
    aim = (lo + hi) * .5
    rig = collection('REVIEW | excluded from export')
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280; scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.exposure = 0
    if not scene.world:
        scene.world = bpy.data.worlds.new('Neutral review world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.28, .32, .38, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    cam = bpy.data.cameras.new('Review eye'); camera = bpy.data.objects.new('Review eye', cam)
    rig.objects.link(camera)
    camera.location = aim + Vector((distance * .68, -distance * .73, 1.5 - aim.z))
    camera.rotation_euler = (aim - camera.location).to_track_quat('-Z', 'Y').to_euler()
    cam.lens = 48; scene.camera = camera
    light = bpy.data.lights.new('Review sun', 'SUN'); light.energy = 2.3; light.angle = .12
    sun = bpy.data.objects.new('Review sun', light); rig.objects.link(sun)
    sun.rotation_euler = (.50, -.35, -.48)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    record = {'path': str(path), 'camera': [list(row) for row in camera.matrix_world],
              'lens': cam.lens, 'distanceRequested': distance, 'resolution': [1280, 720],
              'samples': 24, 'viewTransform': scene.view_settings.view_transform,
              'exposure': 0, 'sunRotation': list(sun.rotation_euler), 'sunEnergy': light.energy}
    for o in list(rig.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(rig)
    return record


def build(aid, args, provenance):
    source = REPO / f'tools/world/nature-craft/blend/{aid}.blend'
    inputs = {'editable': file_record(source),
              'runtime': file_record(REPO / f'public/assets/world/nature-craft/{aid}.glb'),
              'fixedCollider': file_record(REPO / f'public/assets/world/camp/{aid}.glb')}
    reset(); bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.preferences.filepaths.save_version = 0
    root = bpy.data.objects.get(aid)
    assert root is not None and root.type == 'EMPTY', f'Missing original root {aid}'
    originals = [o for o in root.children_recursive if o.type == 'MESH']
    assert originals, f'Missing source meshes {aid}'
    bpy.context.view_layer.update()
    root_matrix = [list(row) for row in root.matrix_world]
    before = mesh_stats(originals); validate(before)
    palette = baseline_palette(originals)
    renders = []
    if args.render:
        renders.append(render_review(originals, REPORT / f'{aid}-{REVISION}-baseline-player10m.png', 10))
    parts, construction, center = layer_shell(aid, originals, root)
    baseline = collection(aid + ' | actual baseline | excluded from export')
    for o in originals:
        for c in list(o.users_collection): c.objects.unlink(o)
        baseline.objects.link(o)
        o.name = 'BASELINE | ' + o.name
        o.hide_set(True); o.hide_render = True
    baseline.hide_render = True; baseline.hide_viewport = True
    mats = materials(args.maps)
    finish_surfaces(parts, mats, palette, construction, center, aid)
    bpy.context.view_layer.update()
    ao_record,ao_image=bake_cavity_ao(parts)
    construction['cavityAO']=ao_record
    root['batch6Construction'] = 'Single inherited mass with a finite oblique body joint, unequal chipped shoulders and whole mineral bed; true contact/extrema fixed, original major faces are not vertex-locked'
    root['batch6Collision'] = 'Unchanged original camp GLB; visual-only material/strata derivative'
    bpy.context.view_layer.update()
    native_stats = mesh_stats(parts); validate(native_stats)
    construction['retainedVolumeFraction']=native_stats['signedVolume']/before['signedVolume']
    assert construction['retainedVolumeFraction']>.75,'New fractures must preserve the single substantial rock body'
    for edge in range(2):
        for axis in range(3):
            assert abs(before['boundsZUp'][edge][axis] - native_stats['boundsZUp'][edge][axis]) < 2e-5, 'Changed original dimensions'
    if args.render:
        renders.append(render_review(parts, REPORT / f'{aid}-{REVISION}-native-player10m.png', 10))
        renders.append(render_review(parts, REPORT / f'{aid}-{REVISION}-native-close3m.png', 3))
    native_path = NATIVE / f'{aid}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(native_path), compress=True)
    merged = runtime_shell(parts)
    runtime_stats = mesh_stats([merged]); validate(runtime_stats)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True); merged.select_set(True)
    bpy.context.view_layer.objects.active = root
    target = PUBLIC / f'{aid}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_materials='EXPORT', export_texcoords=True,
        export_normals=True, export_attributes=False, export_vertex_color='ACTIVE',
        export_all_vertex_colors=False, export_animations=False, export_cameras=False,
        export_lights=False, export_skins=False, export_extras=True,
        export_image_format='AUTO', export_draco_mesh_compression_enable=False)
    attach_cavity_ao(target,ao_image)
    # Different family GLBs borrow the same content-addressed image URLs. The
    # fresh import below validates the final portable GLB plus external maps.
    sys.path.insert(0, str(HERE))
    from shared_images import externalize
    shared_images = externalize(target)
    inventory = glb_inventory(target)
    assert len(inventory['materials']) <= 3, inventory
    assert len(inventory['images']) == 4, 'Expected color, normal, packed roughness and independent geometry AO'
    assert 'TEXCOORD_1' in inventory['attributes'], 'Cavity AO UV1 did not survive export'
    assert all(m['occlusionTexture'] and m['occlusionTexture'].get('texCoord')==1 for m in inventory['materials']), 'Cavity AO must use UV1 on all physical stone surfaces'
    assert all(m['pbr']['baseColorTexture'].get('texCoord',0)==0 and m['pbr']['metallicRoughnessTexture'].get('texCoord',0)==0 and m['normalTexture'].get('texCoord',0)==0 for m in inventory['materials']), 'Original color/normal/roughness must remain on UV0'
    assert 'COLOR_0' in inventory['attributes'], 'Mineral pigment was lost on export'
    assert all(m['alphaMode'] == 'OPAQUE' and 'KHR_materials_transmission' not in m['extensions']
               for m in inventory['materials']), inventory
    assert all(m['pbr'].get('baseColorTexture') is not None and
               m['pbr'].get('metallicRoughnessTexture') is not None and m['normalTexture'] is not None
               for m in inventory['materials']), 'A required PBR channel did not survive the exporter'
    assert len({m['pbr']['baseColorTexture']['index'] for m in inventory['materials']}) == 1
    assert len({m['pbr']['metallicRoughnessTexture']['index'] for m in inventory['materials']}) == 1
    assert len({m['normalTexture']['index'] for m in inventory['materials']}) == 1
    reset(); bpy.ops.import_scene.gltf(filepath=str(target))
    fresh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    fresh_stats = mesh_stats(fresh_objects); validate(fresh_stats)
    assert bpy.data.objects.get(aid) is not None, 'Original family root lost on round trip'
    assert all(tuple(im.size) == (512, 512) for im in bpy.data.images
               if im.type != 'RENDER_RESULT'), 'Unexpected exported image resolution'
    assert fresh_stats['triangles'] == runtime_stats['triangles'], 'Triangle loss on round trip'
    for edge in range(2):
        for axis in range(3):
            assert abs(fresh_stats['boundsZUp'][edge][axis] - runtime_stats['boundsZUp'][edge][axis]) < 3e-5, 'Axis/root drift on round trip'
    if args.render:
        renders.append(render_review(fresh_objects, REPORT / f'{aid}-{REVISION}-fresh-player10m.png', 10))
    # A reread also proves the script has never overwritten any frozen input.
    assert all(digest(Path(r['path'])) == r['sha256'] for r in inputs.values())
    return {'revision': REVISION, 'diagnostic': {
                'previousResult': 'R7 insufficient; R8D six clay/local-environment observations established almost unchanged visible mass and insufficient mesoscale form',
                'previousEvidence': [str(REPORT / f'runtime/b6-r8d-{variant}-rock-walk-clay.png')
                                     for variant in ('baseline', 'candidate')],
                'humanCritique': HUMAN_CRITIQUE,
                'cause': 'Protecting every vertex of the two major planes and the upper 23 percent left visible geometry almost unchanged; micro PBR and 3.71 percent side erosion could not supply a macro upgrade',
                'revision': 'Keep pigment/environment and contact/extrema; allow the major faces to form a finite oblique body joint and two unequal shoulder chips, with fresh geometry AO',
                'previousImagesInspectedByScriptAuthor': True,
                'newVisualAcceptance': 'pending primary actual-engine comparison of largest background pair'},
            'inputs': inputs, 'baseline': before, 'baselineGlb': glb_inventory(Path(inputs['runtime']['path'])),
            'rootMatrixZUp': root_matrix, 'inheritedPigmentLinearRGB': palette,
            'construction': construction, 'native': native_stats, 'runtime': runtime_stats,
            'freshImport': fresh_stats, 'glb': inventory,
            'images': [{'name': im.name, 'size': list(im.size), 'colorSpace': im.colorspace_settings.name}
                       for im in bpy.data.images if im.type != 'RENDER_RESULT'],
            'artifacts': {'native': file_record(native_path), 'glb': file_record(target)},
            'sources': provenance, 'sharedImages': shared_images, 'reviewRenders': renders,
            'evidence': {'geometryValidated': True, 'freshImportValidated': True,
                         'rendersGenerated': bool(args.render), 'rendersInspected': False,
                         'runtimeValidated': False, 'humanVisualAccepted': False},
            'limitations': ['Fixed collider may exceed recessed visual seams by the recorded inset.',
                            'Named native beds are open surface patches; welded aggregate is the solid.',
                            'Ordinary engine daylight/night comparison and tilted/buried placement review remain required.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', choices=tuple(PROFILE), default=['G21'])
    parser.add_argument('--maps', type=Path, default=DEFAULT_MAPS)
    parser.add_argument('--render', action='store_true', help='Also generate controlled baseline/native/fresh evidence images')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    provenance = licensed_sources(args.maps.resolve())
    for folder in (PUBLIC, NATIVE, REPORT): folder.mkdir(parents=True, exist_ok=True)
    manifest_path = REPORT / 'manifest-rocks.json'
    previous = manifest_path.read_text() if manifest_path.exists() else None
    manifest = json.loads(previous) if previous else {}
    prior_receipt = REPORT / f'manifest-rocks-before-{REVISION}.json'
    if previous and not prior_receipt.exists():
        prior_receipt.write_text(previous)
    revision_receipt = REPORT / f'manifest-rocks-{REVISION}.json'
    manifest.update({'schema': 'batch6-rocks-v2', 'revision': REVISION,
                     'previousReceipt': str(prior_receipt) if prior_receipt.exists() else None,
                     'baselineRevision': '7702c3d',
                     'generator': file_record(Path(__file__)), 'blenderVersion': bpy.app.version_string,
                     'sharedImageExporter': file_record(HERE / 'shared_images.py'),
                     'revisionDiagnostic': {'humanCritique': HUMAN_CRITIQUE,
                                            'previousVisualResult': 'R7 unaccepted (76e701c); R8D six observations and restored-state evidence frozen in 3372cbb',
                                            'acceptance': 'Pending primary actual-engine largest-background-pair review'},
                     'coordinates': 'metres; native Z-up/+X front; glTF exporter export_yup exactly once',
                     'command': [str(v) for v in sys.argv],
                     'sharedImages': 'Identical family image content; runtime adapter must share actual GPU texture identity.'})
    assets = manifest.setdefault('assets', {})
    for aid in dict.fromkeys(args.ids):
        manifest['status'] = 'building'
        try:
            assets[aid] = build(aid, args, provenance)
        except Exception as exc:
            # A rejected geometry/export attempt is a revision receipt too; keep
            # the prior successful assets explicitly separate from this failure.
            manifest['status'] = 'failed'
            manifest['failure'] = {'id': aid, 'revision': REVISION,
                                   'errorType': type(exc).__name__, 'message': str(exc)}
            revision_receipt.write_text(json.dumps(manifest, indent=2) + '\n')
            raise
        manifest['status'] = 'exported-awaiting-visual-review'
        manifest.pop('failure', None)
        # Per-asset checkpoint avoids claiming an incomplete expansion succeeded.
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        revision_receipt.write_text(json.dumps(manifest, indent=2) + '\n')
        print('BATCH6_ROCK', aid, json.dumps({'triangles': assets[aid]['runtime']['triangles'],
              'bytes': assets[aid]['artifacts']['glb']['bytes'], 'freshImport': 'passed'}))


if __name__ == '__main__':
    main()
