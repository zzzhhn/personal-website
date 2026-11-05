"""Canonical visible-only GLB signature; ignores offsets and the new shadow root."""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def signature(path):
    blob = Path(path).read_bytes()
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    binary = blob[28 + length:]

    def digest(data):
        return hashlib.sha256(data).hexdigest()

    def image(index):
        entry = doc['images'][index]
        view = doc['bufferViews'][entry['bufferView']]
        offset = view.get('byteOffset', 0)
        return {'name': entry.get('name'), 'mimeType': entry.get('mimeType'),
                'sha256': digest(binary[offset:offset + view['byteLength']])}

    def material(value):
        if isinstance(value, list):
            return [material(v) for v in value]
        if not isinstance(value, dict):
            return value
        result = {k: material(v) for k, v in value.items() if k != 'index'}
        if 'index' in value:
            texture = doc['textures'][value['index']]
            result['texture'] = {'image': image(texture['source']),
                                 'sampler': doc.get('samplers', [])[texture['sampler']] if 'sampler' in texture else {}}
        return result

    def accessor(index):
        entry = doc['accessors'][index]
        view = doc['bufferViews'][entry['bufferView']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[entry['type']]
        size = width * {5126: 4, 5125: 4, 5123: 2, 5121: 1}[entry['componentType']]
        stride = view.get('byteStride', size)
        offset = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
        packed = b''.join(binary[offset + i * stride:offset + i * stride + size] for i in range(entry['count']))
        return {'componentType': entry['componentType'], 'type': entry['type'], 'count': entry['count'],
                'normalized': entry.get('normalized', False), 'sha256': digest(packed)}

    def node(index):
        entry = doc['nodes'][index]
        result = {k: entry[k] for k in ('name', 'matrix', 'translation', 'rotation', 'scale') if k in entry}
        if 'mesh' in entry:
            result['primitives'] = [
                {'mode': p.get('mode', 4), 'attributes': {k: accessor(v) for k, v in p['attributes'].items()},
                 'indices': accessor(p['indices']), 'material': material(doc['materials'][p['material']])}
                for p in doc['meshes'][entry['mesh']]['primitives']]
        if 'children' in entry:
            result['children'] = [node(i) for i in entry['children']]
        return result

    roots = {name: node(next(i for i, entry in enumerate(doc['nodes']) if entry.get('name') == name))
             for name in ('GateStatic', 'GateLeaf', 'GateKey')}
    return {'glbSha256': digest(blob), 'roots': roots,
            'visibleSha256': digest(json.dumps(roots, sort_keys=True, separators=(',', ':')).encode())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('glb', type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--output', type=Path)
    mode.add_argument('--compare', type=Path)
    args = parser.parse_args()
    result = signature(args.glb)
    if args.compare:
        baseline = json.loads(args.compare.read_text())
        assert result['roots'] == baseline['roots'], 'Visible geometry/material/texture signature changed'
    else:
        assert not args.output.exists(), 'Preserve the frozen before signature'
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'roots'}))
