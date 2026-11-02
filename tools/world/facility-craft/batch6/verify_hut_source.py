"""Prove final archive export did not change the R2 photographed hut source.
The named capture checkpoint preserves Blender's first R2 .blend1 used for WebGL.
Compare source semantics rather than nondeterministic container bytes.
"""
from pathlib import Path
import bpy
import hashlib
import json

ROOT=Path.cwd()
native=ROOT/'tools/world/facility-craft/batch6/native'


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    objects=[]
    for obj in sorted(bpy.data.objects,key=lambda o:o.name):
        if obj.type!='MESH':continue
        mesh=obj.data
        polygons=[]
        for polygon in mesh.polygons:
            corners=[]
            for index in polygon.loop_indices:
                point=tuple(mesh.vertices[mesh.loops[index].vertex_index].co)
                uv=tuple(tuple(layer.data[index].uv) for layer in mesh.uv_layers)
                corners.append((point,uv))
            # BMesh vertex/face enumeration can vary across Blender processes.
            # Ignore enumeration while retaining winding and UV per face corner.
            cycle=min(tuple(corners[i:]+corners[:i]) for i in range(len(corners)))
            polygons.append((polygon.material_index,polygon.use_smooth,cycle))
        objects.append({'name':obj.name,'parent':obj.parent.name if obj.parent else None,
            'matrix':[list(row) for row in obj.matrix_local],
            'vertices':sorted(tuple(v.co) for v in mesh.vertices),
            'polygons':sorted(polygons),
            'materials':[m.name for m in mesh.materials]})
    images={i.name:hashlib.sha256(bytes(i.packed_file.data)).hexdigest() for i in bpy.data.images if i.packed_file}
    text=json.dumps({'objects':objects,'images':images},sort_keys=True,separators=(',',':'))
    return {'meshes':len(objects),'semanticSHA256':hashlib.sha256(text.encode()).hexdigest(),'packedImageHashes':images}


old=snapshot(native/'huts-r2-captured.blend')
current=snapshot(native/'huts.blend')
assert old==current,(old,current)
report={'equal':True,'firstCaptureNative':old,'finalNative':current,
    'inputs':{'firstCapture':'tools/world/facility-craft/batch6/native/huts-r2-captured.blend',
              'final':'tools/world/facility-craft/batch6/native/huts.blend',
              'firstCaptureRawSHA256':hashlib.sha256((native/'huts-r2-captured.blend').read_bytes()).hexdigest()},
    'scope':'Exact native names/parents/transforms/vertex coordinates/oriented polygon corner positions/material assignments/smooth flags/corner UV and packed image bytes, canonicalized only for vertex/face enumeration. Final re-export changes portable material factors only; runtime container hashes can vary with exporter ordering.'}
out=ROOT/'docs/world/phase-2-playground/asset-batch6-20261103/facilities/hut-source-equivalence.json'
out.write_text(json.dumps(report,indent=2))
print('HUT_SOURCE_EQUIVALENCE '+json.dumps({'equal':True,'meshes':current['meshes'],'semanticSHA256':current['semanticSHA256']}))
