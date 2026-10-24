"""Shared Blender helpers for camp-content assets (C11-C16, L01 exit lamp post).

Reuses the reviewed shell primitives of tools/world/camp/props/build_props.py (box, strut, lathe,
torus, sphere, outward winding) and adds the camp-content export contract:

* Blender Z-up, asset front +X (faces the fire), width along Y; exporter converts to glTF +Y once.
* Each face carries a palette key. Colours are baked into a linear COLOR_0 corner attribute and the
  faces collapse to at most three shared materials by PBR class (cc_matte, cc_metal, cc_glow), so
  one GLB node costs one draw call per class at runtime. Roles/hex per key go to root extras.
* Smooth shading with sharp edges above SHARP_DEG: >= 12-sided rounds read round, boxes and
  one-segment bevels stay crisp.
* Root empty named <ID>, origin bottom centre (min Z = 0, XY bounds centred), Draco 20-bit.
"""
import bpy, bmesh, math, os, sys, json, importlib.util
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
_spec = importlib.util.spec_from_file_location('camp_props', os.path.join(REPO, 'tools/world/camp/props/build_props.py'))
_props = importlib.util.module_from_spec(_spec)
_saved = sys.argv
sys.argv = [sys.argv[0]]  # build_props parses argv at import; keep it inert
_spec.loader.exec_module(_props)
sys.argv = _saved
box, strut, lathe, torus, sphere, orient_outward, srgb_to_linear = (
    _props.box, _props.strut, _props.lathe, _props.torus, _props.sphere, _props.orient_outward, _props.srgb_to_linear)

BLEND_DIR = os.path.join(HERE, 'blend')
GLB_DIR = os.path.join(REPO, 'public/assets/world/camp')
GEN_VERSION = 'camp-content-r1'
SHARP_DEG = 38.0
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=20, export_draco_normal_quantization=12,
             export_draco_color_quantization=10, export_draco_generic_quantization=12)

# key: (sRGB hex, materialRole, PBR class). Art Lock v1 palette + v1.2 camp derivatives only.
PALETTE = {
    'wood_light': ('#B99469', 'wood', 'cc_matte'),
    'wood_mid': ('#8E6E55', 'wood', 'cc_matte'),
    'wood_dark': ('#5A4634', 'wood', 'cc_matte'),
    'paper': ('#E6DCCB', 'paper', 'cc_matte'),
    'canvas_orange': ('#E8803A', 'canvas', 'cc_matte'),
    'canvas_edge': ('#B9602A', 'canvas', 'cc_matte'),
    'canvas_cream': ('#E6DCCB', 'canvas', 'cc_matte'),
    'canvas_slate': ('#4E647D', 'canvas', 'cc_matte'),
    'accent_olive': ('#7E8C3E', 'accent', 'cc_matte'),
    'stone': ('#8C8276', 'stone', 'cc_matte'),
    'stone_top': ('#B4A896', 'stone', 'cc_matte'),
    'stone_dark': ('#5B5650', 'stone', 'cc_matte'),
    'slate_stone': ('#8A8580', 'stone', 'cc_matte'),
    'rubber': ('#3A3836', 'rubber', 'cc_matte'),
    'brass': ('#B8975A', 'metal', 'cc_metal'),
    'iron': ('#5E5B57', 'metal', 'cc_metal'),
    'iron_dark': ('#45423F', 'metal', 'cc_metal'),
    'steel': ('#8D8B86', 'metal', 'cc_metal'),
    'glass_warm': ('#FFC978', 'glass', 'cc_glow'),
    'lens_cyan': ('#4FD1C5', 'light', 'cc_glow'),
}
CLASSES = {  # (roughness, metallic)
    'cc_matte': (0.82, 0.0),
    'cc_metal': (0.58, 0.35),
    'cc_glow': (0.9, 0.0),
}


def lin(hexs):
    h = hexs.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


class Part:
    """Closed shells accumulated into one bmesh; each face remembers its palette key."""
    def __init__(self, name):
        self.name, self.bm, self.keys = name, bmesh.new(), []
        self.layer = self.bm.faces.layers.int.new('ck')

    def key_index(self, key):
        if key not in PALETTE:
            raise KeyError(key)
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def add(self, src, key, key_map=None, orient=True):
        """Append bmesh src; key for all faces, or key_map {src material_index: key}."""
        if orient:
            orient_outward(src)
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf[self.layer] = self.key_index(key_map.get(f.material_index, key) if key_map else key)
        src.free()
        return self


def xform(bm, rot=None, loc=(0, 0, 0), scale=None):
    """rot: Matrix (3x3) or (axis, angle)."""
    if scale is not None:
        bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    if rot is not None:
        m = rot if isinstance(rot, Matrix) else Matrix.Rotation(rot[1], 3, rot[0])
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=m)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(loc))
    return bm


def prism(poly, z0, z1, bevel=0.0):
    """Extrude a convex-or-concave CCW XY polygon [(x, y)...] from z0 to z1 (closed)."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    n = len(poly)
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', profile_type='SUPERELLIPSE',
                        segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


_mats = {}


def class_material(cls):
    """cc_matte and cc_metal share ONE material 'cc_vc' (vertex alpha = metal flag drives metallic and
    roughness in the node tree here and in the runtime shader patch), so a node is one primitive.
    cc_glow stays separate (emissive at runtime)."""
    name = 'cc_glow' if cls == 'cc_glow' else 'cc_vc'
    if name in _mats and _mats[name].name in bpy.data.materials:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if name == 'cc_vc':
        mr, mm = CLASSES['cc_matte'], CLASSES['cc_metal']
        met = nt.nodes.new('ShaderNodeMath'); met.operation = 'MULTIPLY'; met.inputs[1].default_value = mm[1]
        nt.links.new(attr.outputs['Alpha'], met.inputs[0]); nt.links.new(met.outputs[0], bsdf.inputs['Metallic'])
        rough = nt.nodes.new('ShaderNodeMapRange')
        rough.inputs['To Min'].default_value = mr[0]; rough.inputs['To Max'].default_value = mm[0]
        nt.links.new(attr.outputs['Alpha'], rough.inputs['Value']); nt.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = mr[0]
        m['materialRole'] = 'vertex-colour matte; alpha 1 = matte metal (metallic 0.35, roughness 0.58)'
    else:
        bsdf.inputs['Roughness'].default_value = CLASSES['cc_glow'][0]
        m['materialRole'] = 'light'
    _mats[name] = m
    return m


def _bounds(parts):
    pts = [v.co for p in parts for v in p.bm.verts]
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))


def finalize(asset_id, parts, pivots=None, root_extras=None, part_extras=None, recentre=True):
    """Recentre (XY bounds centre, min Z = 0), bake colours, collapse to PBR-class materials.
    pivots {part: world Vector} set node origins (for runtime animation pivots)."""
    pivots, part_extras = pivots or {}, part_extras or {}
    lo, hi = _bounds(parts)
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)) if recentre else Vector()
    root = bpy.data.objects.new(asset_id, None)
    bpy.context.scene.collection.objects.link(root)
    objs, keys_used = [], set()
    for p in parts:
        pivot = pivots[p.name] + shift if p.name in pivots else Vector()
        bmesh.ops.translate(p.bm, verts=p.bm.verts, vec=shift - pivot)
        me = bpy.data.meshes.new(p.name)
        face_keys = [p.keys[f[p.layer]] for f in p.bm.faces]
        p.bm.to_mesh(me)
        p.bm.free()
        mats = []
        for k in face_keys:
            mt = class_material(PALETTE[k][2])
            if mt not in mats:
                mats.append(mt)
        for mt in mats:
            me.materials.append(mt)
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = 0
        for poly, k in zip(me.polygons, face_keys):
            poly.material_index = mats.index(class_material(PALETTE[k][2]))
            poly.use_smooth = True
            # alpha = metal flag: the runtime renders every node with ONE material and reads
            # metalness/roughness from it (matte 0.82/0, metal 0.58/0.35), saving a draw per class.
            c = lin(PALETTE[k][0])[:3] + ((1.0 if PALETTE[k][2] == 'cc_metal' else 0.0),)
            for li in poly.loop_indices:
                col.data[li].color = c
            keys_used.add(k)
        me.set_sharp_from_angle(angle=math.radians(SHARP_DEG))
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
    root['palette'] = json.dumps({k: {'hex': PALETTE[k][0], 'role': PALETTE[k][1], 'class': PALETTE[k][2]} for k in sorted(keys_used)})
    for k, v in (root_extras or {}).items():
        root[k] = v
    return root, objs, shift


def to_glb(v, shift=Vector()):
    """Blender pre-shift point -> final GLB-local coordinates."""
    v = Vector(v) + shift
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def export(asset_id, root, objs):
    os.makedirs(BLEND_DIR, exist_ok=True)
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, f'{asset_id}.blend'), compress=True)
    glb = os.path.join(GLB_DIR, f'{asset_id}.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE',
        export_texcoords=False, export_tangents=False, export_cameras=False, export_lights=False,
        export_animations=False, export_extras=True, export_image_format='NONE', **DRACO)
    print(f'[camp-content] wrote {glb}')
    return glb


def run(builders):
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = set(args)
    for aid, fn in builders.items():
        if only and aid not in only:
            continue
        reset_scene()
        _mats.clear()
        fn()
