"""Describe the authored contact subsets without opening Blender or modifying the shipping files."""
import json
import math

from geometry import PROXIES, build_geometry, collision_data, deck_points, triangles
from geometry import add, cross, mul, sub, unit
from layout import OUT, RAMPS, BRIDGE, GALLERY_RAMPS, GALLERY_BRIDGES


def part_envelopes(mesh):
    """Each bevelled part still fits the bounds of its distinct authoring island."""
    parent = list(range(len(mesh.vertices)))

    def root(i):
        while i != parent[i]:
            i = parent[i]
        return i

    for face in mesh.faces:
        for i in face[1:]:
            parent[root(i)] = root(face[0])
    islands = {}
    for i, vertex in enumerate(mesh.vertices):
        islands.setdefault(root(i), []).append(vertex)
    for points in islands.values():
        low = [min(p[k] for p in points) for k in range(3)]
        high = [max(p[k] for p in points) for k in range(3)]
        yield {'center': [(a+b)/2 for a,b in zip(low,high)], 'size': [b-a for a,b in zip(low,high)],
               'axes': [[1,0,0],[0,1,0],[0,0,1]]}


def build_receipt():
    meshes = build_geometry()
    actual = json.loads((OUT/'colliders.json').read_text())
    assert collision_data() == actual, 'Authoring geometry no longer matches the shipping legacy colliders'
    routes = RAMPS + [BRIDGE] + GALLERY_RAMPS + GALLERY_BRIDGES
    names = {route['id']: ('west' if route['id']=='ramp-west-0-3' else route['id']) for route in routes}
    groups = {}

    def define(name, material):
        groups[name] = {'batch': 'AM_batch_'+material, 'volumes': [], 'old': []}

    define('rack-frame','wood')
    define('rack-hooks','metal')
    trays = {'AM01_ore_catch_vein-'+name: name+'-tray' for name in ['lower','middle','upper']}
    stone_sections = {**trays, 'AM04_basin_masonry':'pool-rim', 'AM04_basin_floor':'pool-floor'}
    for key in stone_sections.values():
        define(key,'stone')
    define('pool-drop-studs','metal')
    structures = {}
    for route in routes:
        name = names[route['id']]
        structures['AM02_'+route['id']] = name+'-structure'
        for part, material in [('deck','wood'),('structure','wood'),('fasteners','metal')]:
            define(name+'-'+part,material)

    cursor = {key:0 for key in actual}
    for mesh in meshes.values():
        if mesh.material not in ['stone','ground']:
            continue
        for tri in triangles(mesh):
            a,b,c = [mesh.vertices[i] for i in tri]
            normal = unit(cross(sub(b,a),sub(c,a)))
            kind = 'surface' if normal[1]>=math.cos(math.radians(25)) else 'solid'
            section = stone_sections.get(mesh.name)
            if section:
                groups[section]['old'].append([kind,cursor[kind],3])
            cursor[kind] += 3
    for source, section in stone_sections.items():
        groups[section]['volumes'] = list(part_envelopes(meshes[source]))

    for proxy in PROXIES:
        name = proxy['id'].rsplit('-', 1)[0]
        kind = proxy['kind']
        length = len(proxy['indices']) if proxy['shape']=='trimesh' else 36
        part = {'AM03_tool_rack':'rack-frame','AM04_drop_studs':'pool-drop-studs'}.get(name)
        if name in names:
            part = names[name]+'-deck'
        for prefix, key in structures.items():
            if name.startswith(prefix+'_'):
                part = key
                break
        if part:
            group = groups[part]
            group['old'].append([kind,cursor[kind],length])
            if proxy['shape']=='oriented-box':
                group['volumes'].append({k:proxy[k] for k in ['center','size','axes']})
        cursor[kind] += length
    for kind in actual:
        assert cursor[kind] == len(actual[kind]['indices'])

    for route in routes:
        a,b,_,side,_ = deck_points(route)
        along = unit(sub(b,a))
        normal = unit(cross(side,along))
        if normal[1] < 0:
            normal = mul(normal,-1)
        distance = math.dist(a,b)
        board_count = math.ceil(distance/.27)
        name = names[route['id']]
        for i in range(board_count):
            p = add(add(a,mul(sub(b,a),(i+.5)/board_count)),mul(normal,-.085))
            groups[name+'-deck']['volumes'].append({'center':p, 'size':[route['deckWidth'],.17,distance/board_count-.012],
                                                  'axes':[side,normal,mul(along,-1)]})
        source = 'AM02_'+route['id']
        groups[name+'-fasteners']['volumes'] = [
            volume for suffix in ['_joint_straps','_joint_bolts'] if source+suffix in meshes
            for volume in part_envelopes(meshes[source+suffix])]
        if not groups[name+'-fasteners']['volumes']:
            del groups[name+'-fasteners']
    groups['rack-hooks']['volumes'] = list(part_envelopes(meshes['AM03_tool_hooks']))
    for group in groups.values():
        compact = []
        for kind, start, length in sorted(group['old']):
            if compact and compact[-1][0] == kind and compact[-1][1] + compact[-1][2] == start:
                compact[-1][2] += length
            else:
                compact.append([kind, start, length])
        group['old'] = compact
    return {'parts':groups, 'legacyLengths':{key:len(p['indices']) for key,p in actual.items()}}


if __name__ == '__main__':
    print(json.dumps(build_receipt()))
