"""Derive far vehicle visuals from the final editable L0s, without touching L0 GLBs or hull JSON.
Run: blender-run.sh vehicles-integration tools/world/vehicles/build_lod.py [G25|G26|G27]
Whole small shells are omitted, body structure is collapsed, glass/working lamps are retained.
Wheels keep their original pivots/dimensions, but use a smooth 16-sided tyre and simple rim/spokes.
"""
import os, sys, json, hashlib, math
import bpy, bmesh
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/vehicles'))
import vehlib as V
from mathutils import Vector
# Preserve extra position precision on the reduced silhouette; L0 compression is untouched.
V.DRACO['export_draco_position_quantization']=20

args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
assets = args[:1] if args and args[0] in ('G25','G26','G27') else ['G25','G26','G27']

def digest(p):
    with open(p,'rb') as f: return hashlib.sha256(f.read()).hexdigest()

def subset(source, name, keep):
    bm = bmesh.new(); bm.from_mesh(source.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mat in source.data.materials: me.materials.append(mat)
    ob = bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(ob)
    ob.parent=source.parent
    return ob

def reduce_body(source):
    is_coupe=source.name.startswith('G26')
    bm=bmesh.new();bm.from_mesh(source.data);bm.verts.ensure_lookup_table();seen=set();structure=set();protected=set();dropped=[]
    for seed in bm.verts:
        if seed.index in seen:continue
        stack=[seed];verts=[];seen.add(seed.index)
        while stack:
            v=stack.pop();verts.append(v)
            for e in v.link_edges:
                n=e.other_vert(v)
                if n.index not in seen: seen.add(n.index);stack.append(n)
        faces={f for v in verts for f in v.link_faces}
        roles={source.data.materials[f.material_index].get('materialRole','paint') for f in faces}
        lo=Vector(tuple(min(v.co[i] for v in verts) for i in range(3)))
        hi=Vector(tuple(max(v.co[i] for v in verts) for i in range(3)))
        ids={v.index for v in verts}
        if any(r.startswith('light_') or r=='glass' for r in roles):protected.update(ids)
        elif max(hi-lo)<.14:
            dropped.append(dict(vertices=len(verts),faces=len(faces),size=list(hi-lo),roles=sorted(roles)))
        else:structure.update(ids)
    bm.free()
    structure_ob=subset(source,'body-structure',structure)
    protected_ob=subset(source,'glass-working-lamps',protected)
    bpy.ops.object.select_all(action='DESELECT');structure_ob.select_set(True);bpy.context.view_layer.objects.active=structure_ob
    dec=structure_ob.modifiers.new('far-structure-collapse','DECIMATE');dec.ratio=.22;dec.use_collapse_triangulate=True
    if is_coupe:
        # The slate stripe is a material boundary on the body loft. Dissolve within material regions
        # keeps its exact shape; unconstrained collapse can erase the narrow stripe altogether.
        dec.decimate_type='DISSOLVE';dec.angle_limit=math.radians(15);dec.delimit={'MATERIAL'}
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Joining preserves the individual closed shell semantics; no global Boolean or voxel remesh.
    protected_ob.select_set(True);bpy.ops.object.join()
    name=source.name;bpy.data.objects.remove(source,do_unlink=True);structure_ob.name=name
    # Freeze the triangulation before counting/export; glTF otherwise chooses different diagonals
    # on collapsed non-planar n-gons and can discard collinear ears.
    tri=structure_ob.modifiers.new('far-export-triangulate','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
    bm=bmesh.new();bm.from_mesh(structure_ob.data);seen=set();flat=[];flat_shells=0
    for seed in bm.verts:
        if seed in seen:continue
        stack=[seed];seen.add(seed);verts=[]
        while stack:
            v=stack.pop();verts.append(v)
            for e in v.link_edges:
                n=e.other_vert(v)
                if n not in seen:seen.add(n);stack.append(n)
        faces={f for v in verts for f in v.link_faces}
        # Some very thin nonessential closed pieces collapse to two coincident faces. Omit those
        # whole zero-volume shells in the generator, instead of relying on glTF to discard them.
        origin=tuple(verts[0].co);terms=[]
        for f in faces:
            a,b,c=[tuple(float(v.co[i])-origin[i] for i in range(3)) for v in f.verts]
            terms.append((a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6)
        if abs(math.fsum(terms))<1e-10:flat.extend(verts);flat_shells+=1
    if flat:bmesh.ops.delete(bm,geom=flat,context='VERTS')
    bm.to_mesh(structure_ob.data);bm.free()
    structure_ob.data.shade_smooth();structure_ob.data.set_sharp_from_angle(angle=math.radians(32))
    return structure_ob,dict(reduction='material-delimited 15deg dissolve' if is_coupe else '22 percent collapse',droppedShells=len(dropped),dropped=dropped,collapsedFlatShells=flat_shells,protectedRoles=['glass','light_front','light_brake','light_reverse','light_beacon'])

def far_wheel(asset,R,width):
    rim_r={'G25':.225,'G26':.245,'G27':.30}[asset]
    rim='veh_accent_cream' if asset=='G25' else 'veh_metal_dark' if asset=='G26' else 'veh_metal'
    p=V.Part(asset+'_far_wheel',smooth_angle=45);hw=width/2
    if asset=='G26':
        # Keep the coupe's defining slate body stripe. Spend its far budget there; at 60m the dark
        # spokes are subpixel, so its wheel keeps a 16-sided tyre, solid rim disc and centre hub.
        bm,_=V.lathe([(rim_r*.97,-hw),(R,-hw),(R,hw),(rim_r*.97,hw)],16)
        p.add(bm,'veh_rubber')
        p.add(V.cylinder((0,hw*.80,0),(0,hw*.84,0),rim_r*.98,12),rim)
        p.add(V.cylinder((0,hw*.84,0),(0,hw*.92,0),rim_r*.20,6),rim)
        return p
    bm,_=V.lathe([(rim_r*.97,-hw*.78),(R*.91,-hw),(R,-hw*.62),(R,hw*.62),(R*.91,hw),(rim_r*.97,hw*.78)],16)
    p.add(bm,'veh_rubber')
    face=hw*.83
    bm,_=V.lathe([(rim_r*.92,face-.015),(rim_r,face),(rim_r*.92,face+.008)],12)
    p.add(bm,rim)
    p.add(V.cylinder((0,face-.028,0),(0,face-.018,0),rim_r*.91,12),'veh_accent_dark')
    if asset=='G27':
        p.add(V.cylinder((0,face-.015,0),(0,face+.002,0),rim_r*.80,12),rim)
    else:
        for k in range(5):
            a=2*math.pi*k/5;ca,sa=math.cos(a),math.sin(a)
            poly=[(r*ca-t*sa,r*sa+t*ca) for r,t in [(rim_r*.2,-.025),(rim_r*.92,-.018),(rim_r*.92,.018),(rim_r*.2,.025)]]
            b,_=V.prism(poly,lambda u,v,d:(u,d,v),face-.016,face+.003);p.add(b,rim)
    p.add(V.cylinder((0,face-.01,0),(0,face+.02,0),rim_r*.20,8),rim)
    return p

for asset in (assets if __name__ == '__main__' else []):
    source_glb=os.path.join(V.GLB_DIR,asset+'.glb');source_blend=os.path.join(V.BLEND_DIR,asset+'.blend')
    frozen={p:digest(p) for p in [source_glb,source_blend,V.HULL_JSON]}
    with open(os.path.join(V.DOC_DIR,asset+'-report.json')) as f: original=json.load(f)
    bpy.ops.wm.open_mainfile(filepath=source_blend)
    root=bpy.data.objects[asset];body,method=reduce_body(bpy.data.objects[asset+'_body'])
    width=root['wheelWidth'];R=root['wheelRadius']
    wheel_ob=V.make_object(far_wheel(asset,R,width),root);wheel_data=wheel_ob.data;bpy.data.objects.remove(wheel_ob,do_unlink=True)
    wheels=[o for o in bpy.context.scene.objects if o.name.startswith('wheel-')]
    for w in wheels:w.data=wheel_data
    objs=[body]+wheels
    checks={o.name:V.mesh_checks(o) for o in [body,wheels[0]]}
    tris={o.name:V.evaluated_tris(o) for o in objs};total=sum(tris.values())
    assert total<=original['totalTris']*.30,(asset,total,original['totalTris'])
    assert all(c['degenerate']==0 and c['nonManifoldEdges']==0 and c['finite'] and c['signedVolume']>0 for c in checks.values()),checks
    bounds=list(V.world_bounds(objs));root['lod']=1;root['sourceSha256']=frozen[source_glb]
    root['sourceTriangles']=original['totalTris'];root['lodTriangles']=total
    body_tris=tris[body.name];wheel_tris=tris[wheels[0].name]
    glb=V.export_glb(asset+'-lod1',root,objs)
    back=V.reimport_check(glb)
    assert sum(back['tris'].values())==total and back['bounds']==bounds,(tris,back)
    assert all(digest(p)==d for p,d in frozen.items()),'L0 or runtime collider data was modified'
    report=dict(asset=asset,lod=1,blender=bpy.app.version_string,sourceSha256=frozen[source_glb],sha256=digest(glb),sourceTris=original['totalTris'],bodyTris=body_tris,wheelTris=wheel_tris,totalTris=total,ratio=total/original['totalTris'],bounds=bounds,sourceBounds=original['sourceBounds'],method=method,checks=checks,reimport=back)
    with open(os.path.join(V.DOC_DIR,asset+'-lod1-report.json'),'w') as f:json.dump(report,f,indent=2)
    print('[vehicle-lod]',asset,total,'/',original['totalTris'],round(report['ratio']*100,1),'%')
