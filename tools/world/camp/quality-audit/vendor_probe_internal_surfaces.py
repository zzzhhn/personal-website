"""Diagnostic, NOT a proof: evaluate winding on both sides of triangle samples.
Read-only. Requires Blender bundled numpy. Outward closed surface: w_plus~0, w_minus~1.
Full checks can be expensive: pass max_samples=0 to probe every triangle centroid.
Thin layers closer than epsilon, coincident faces and near-edge intersections can be ambiguous.
"""
import bpy, numpy as np, math


def world_triangles(objects):
    triangles=[]; labels=[]
    dg=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type!='MESH':continue
        ev=obj.evaluated_get(dg);me=ev.to_mesh()
        try:
            me.calc_loop_triangles();points=[ev.matrix_world@v.co for v in me.vertices]
            for i,t in enumerate(me.loop_triangles):
                triangles.append([tuple(points[j]) for j in t.vertices]);labels.append((obj.name,i))
        finally:ev.to_mesh_clear()
    return np.asarray(triangles,dtype=np.float64),labels


def winding_numbers(triangles,query_points):
    answers=[]
    # One query at a time bounds scratch memory independently of mesh triangle count.
    for p in query_points:
        a=triangles[:,0]-p;b=triangles[:,1]-p;c=triangles[:,2]-p
        la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);lc=np.linalg.norm(c,axis=1)
        numerator=np.einsum('ij,ij->i',a,np.cross(b,c))
        denominator=la*lb*lc+np.einsum('ij,ij->i',a,b)*lc+np.einsum('ij,ij->i',b,c)*la+np.einsum('ij,ij->i',c,a)*lb
        answers.append(float(np.sum(2*np.arctan2(numerator,denominator))/(4*math.pi)))
    return np.asarray(answers)


def probe(objects,max_samples=256,relative_offset=1e-5):
    t,labels=world_triangles(objects)
    if not len(t):return {'error':'No triangles'}
    span=float(np.max(np.ptp(t.reshape(-1,3),axis=0)));epsilon=max(span*relative_offset,1e-12)
    indices=np.arange(len(t)) if max_samples==0 or max_samples>=len(t) else np.unique(np.linspace(0,len(t)-1,max_samples).astype(int))
    chosen=t[indices];normals=np.cross(chosen[:,1]-chosen[:,0],chosen[:,2]-chosen[:,0]);lengths=np.linalg.norm(normals,axis=1)
    valid=lengths>max(span*span*1e-14,1e-30);indices=indices[valid];chosen=chosen[valid];normals=normals[valid]/lengths[valid,None]
    centers=np.mean(chosen,axis=1)
    plus=winding_numbers(t,centers+epsilon*normals);minus=winding_numbers(t,centers-epsilon*normals)
    rows=[]
    for i,a,b in zip(indices,plus,minus):
        status='expected_outer_surface' if abs(a)<.1 and abs(b-1)<.1 else ('internal_or_overlap_candidate' if a>.5 and b>.5 else 'orientation_or_surface_ambiguity')
        if status!='expected_outer_surface':rows.append({'object':labels[i][0],'triangle':labels[i][1],'w_plus':float(a),'w_minus':float(b),'status':status})
    return {'triangle_count':len(t),'samples_tested':len(indices),'sampling':'all_centroids' if len(indices)==len(t) else 'uniform_index_subset','epsilon_world':epsilon,'anomalies':rows,'anomaly_count':len(rows),'limitation':'Centroid probes are a diagnostic, not an exhaustive triangle intersection proof; inspect failures and cross-sections, and test at a smaller epsilon for thin surfaces.'}

if __name__=='__main__':
    import json,sys,argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('output',nargs='?')
    parser.add_argument('--prefix',default='',help='Only objects with this name prefix; exclude studio meshes.')
    parser.add_argument('--max-samples',type=int,default=256,help='0 probes every triangle centroid.')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    result=probe([o for o in bpy.context.scene.objects if o.name.startswith(args.prefix)],max_samples=args.max_samples)
    if args.output:open(args.output,'w').write(json.dumps(result,indent=2))
    else:print(json.dumps(result,indent=2))
