# Vendored copy of blender-connected-refinement/scripts/inspect_connectivity.py (2026-10-21) so this group has no external helper dependency.
"""Read-only evaluated-mesh checks in Blender; geometric intersections need separate review.
Usage: blender -b asset.blend -P inspect_connectivity.py -- report.json
An object's connectivity is not proof of assembly contact or lack of self intersections.
"""
import bpy, bmesh, math, json, sys
from collections import Counter, defaultdict
from mathutils import Vector



def closed_vertex_link_failures(mesh):
    """Bounded combinatorial link test; avoids BMVert.is_manifold on corrupt radial loops.
    Each closed-surface vertex must have a connected cycle as its face link.
    Duplicate faces/zero-volume double surfaces are reported separately.
    """
    links=[defaultdict(set) for _ in mesh.vertices]
    degrees=[Counter() for _ in mesh.vertices]
    malformed=set()
    for face in mesh.polygons:
        ids=list(face.vertices)
        if len(set(ids))!=len(ids):malformed.update(ids)
        for j,v in enumerate(ids):
            a,b=ids[j-1],ids[(j+1)%len(ids)]
            if v in (a,b) or a==b:malformed.add(v)
            links[v][a].add(b);links[v][b].add(a)
            degrees[v][a]+=1;degrees[v][b]+=1
    failures=[]
    for v,(graph,degree) in enumerate(zip(links,degrees)):
        if v in malformed or not graph or any(d!=2 for d in degree.values()):failures.append(v);continue
        visited=set();stack=[next(iter(graph))]
        while stack:
            n=stack.pop()
            if n in visited:continue
            visited.add(n);stack.extend(graph[n]-visited)
        if len(visited)!=len(graph):failures.append(v)
    return failures


def inspect_object(obj, relative_area_epsilon=1e-12, sliver_quality_threshold=1e-6):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    try:
        me.calc_loop_triangles()
        points = [ev.matrix_world @ v.co for v in me.vertices]
        size = max(((max(v[k] for v in points)-min(v[k] for v in points)) for k in range(3)), default=0) if points else 0
        eps_area = max(size * size * relative_area_epsilon, 1e-30)
        bm = bmesh.new(); bm.from_mesh(me); bm.transform(ev.matrix_world)
        bm.verts.ensure_lookup_table(); bm.verts.index_update()
        bm.faces.ensure_lookup_table(); bm.faces.index_update()
        adjacency = [set() for _ in bm.verts]
        for e in bm.edges:
            a,b = [v.index for v in e.verts]; adjacency[a].add(b); adjacency[b].add(a)
        labels = [-1]*len(bm.verts); sizes=[]
        for i in range(len(labels)):
            if labels[i] >= 0: continue
            label=len(sizes); stack=[i]; labels[i]=label; count=0
            while stack:
                v=stack.pop(); count+=1
                for n in adjacency[v]:
                    if labels[n] < 0: labels[n]=label; stack.append(n)
            sizes.append(count)
        volumes=[0.0]*len(sizes); faces_per_component=[0]*len(sizes); areas=[]; by_material=defaultdict(float)
        origins={}
        for i,label in enumerate(labels): origins.setdefault(label,points[i])
        triangle_keys=Counter(); qualities=[]
        for tri in me.loop_triangles:
            p,q,r = [points[i] for i in tri.vertices]
            area=(q-p).cross(r-p).length*0.5; areas.append(area)
            denominator=(q-p).length_squared+(r-q).length_squared+(p-r).length_squared
            qualities.append(4*math.sqrt(3)*area/denominator if denominator else 0.0)
            label=labels[tri.vertices[0]]; origin=origins[label]
            volumes[label] += (p-origin).dot((q-origin).cross(r-origin))/6
            triangle_keys[tuple(sorted(tri.vertices))]+=1
            faces_per_component[labels[tri.vertices[0]]] += 1
            mat_index=me.polygons[tri.polygon_index].material_index
            mat=me.materials[mat_index] if mat_index<len(me.materials) else None
            by_material[mat.name if mat else '<empty>'] += area
        row={
            'name':obj.name, 'vertices':len(me.vertices), 'triangles':len(me.loop_triangles),
            'vertex_edge_components':len(sizes), 'component_vertex_counts':sizes,
            'component_triangle_counts':faces_per_component, 'component_signed_volumes_world':volumes,
            'zero_or_near_zero_volume_components':sum(abs(v)<=max(size**3*1e-12,1e-30) for v in volumes),
            'negative_volume_components':sum(v<-max(size**3*1e-12,1e-30) for v in volumes),
            'duplicate_triangle_index_sets':sum(n-1 for n in triangle_keys.values() if n>1),
            'boundary_edges':sum(e.is_boundary for e in bm.edges),
            'wire_edges':sum(e.is_wire for e in bm.edges),
            'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
            'nonmanifold_vertices':len(closed_vertex_link_failures(me)),
            'vertex_manifold_method':'Bounded closed-surface vertex-link cycle test; boundary vertices are failures for this closed-surface contract.',
            'inconsistent_winding_edges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
            'zero_or_near_zero_area_triangles':sum(a<=eps_area for a in areas),
            'triangle_area_threshold_world':eps_area,
            'min_triangle_shape_quality':min(qualities,default=0),
            'sliver_triangle_shape_threshold':sliver_quality_threshold,
            'sliver_triangle_count':sum(q<sliver_quality_threshold for q in qualities),
            'finite_coordinates':all(math.isfinite(c) for v in points for c in v),
            'face_material_world_areas':dict(by_material),
            'unproven_checks':['self_intersections','internal_faces','inter_object_contact','attachment_burial'],
        }
        clone=me.copy(); row['mesh_validate_would_repair']=clone.validate(verbose=False); bpy.data.meshes.remove(clone)
        bm.free()
        return row
    finally:
        ev.to_mesh_clear()



def inspect_objects(objects):
    rows=[inspect_object(o) for o in objects if o.type=='MESH']
    return {'blender_version':bpy.app.version_string, 'mesh_objects':len(rows),
            'triangles':sum(r['triangles'] for r in rows),
            'sum_native_components':sum(r['vertex_edge_components'] for r in rows),
            'objects':rows,
            'caveat':'Native edge connectivity, not scene assembly contact. GLB normal/material/UV seams may split vertices: preserve raw results and run a separate tolerance-welded geometric diagnostic on a disposable copy.'}

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('output',nargs='?')
    parser.add_argument('--prefix',default='',help='Only objects with this name prefix; exclude studio meshes.')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    result=inspect_objects(o for o in bpy.context.scene.objects if o.name.startswith(args.prefix))
    if args.output: open(args.output,'w').write(json.dumps(result,indent=2))
    else: print(json.dumps(result,indent=2))
