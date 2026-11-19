"""Describe the authored contact subsets without opening Blender or modifying the shipping files."""
import json
import math

from geometry import PROXIES, build_geometry, collision_data, deck_points
from geometry import add, cross, mul, sub, unit
from layout import OUT, RAMPS


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
    west = 'AM02_ramp-west-0-3'
    groups = {}
    for name, kind in [('rack-frame','wood'),('rack-hooks','metal'),('west-deck','wood'),
                       ('west-structure','wood'),('west-fasteners','metal')]:
        groups[name] = {'batch': 'AM_batch_'+kind, 'volumes': [], 'old': []}

    def length(p):
        return len(p['indices']) if p['shape']=='trimesh' else 36

    cursor = {key:len(actual[key]['indices']) - sum(length(p) for p in PROXIES if p['kind']==key) for key in actual}
    for proxy in PROXIES:
        name = proxy['id'].rsplit('-', 1)[0]
        kind = proxy['kind']
        part = 'rack-frame' if name=='AM03_tool_rack' else 'west-structure' if name.startswith(west) else 'west-deck' if name=='ramp-west-0-3' else None
        if part:
            group = groups[part]
            group['old'].append([kind,cursor[kind],length(proxy)])
            if proxy['shape']=='oriented-box':
                group['volumes'].append({k:proxy[k] for k in ['center','size','axes']})
        cursor[kind] += length(proxy)

    route = next(route for route in RAMPS if route['id']=='ramp-west-0-3')
    a,b,_,side,_ = deck_points(route)
    along = unit(sub(b,a))
    normal = unit(cross(side,along))
    if normal[1] < 0:
        normal = mul(normal,-1)
    distance = math.dist(a,b)
    board_count = math.ceil(distance/.27)
    for i in range(board_count):
        p = add(add(a,mul(sub(b,a),(i+.5)/board_count)),mul(normal,-.085))
        groups['west-deck']['volumes'].append({'center':p, 'size':[route['deckWidth'],.17,distance/board_count-.012],
                                              'axes':[side,normal,mul(along,-1)]})
    groups['rack-hooks']['volumes'] = list(part_envelopes(meshes['AM03_tool_hooks']))
    groups['west-fasteners']['volumes'] = list(part_envelopes(meshes[west+'_joint_straps'])) + list(part_envelopes(meshes[west+'_joint_bolts']))
    return {'parts':groups, 'legacyLengths':{key:len(p['indices']) for key,p in actual.items()}}


if __name__ == '__main__':
    print(json.dumps(build_receipt()))
