"""Read-only final GLB winding diagnostics and temporary uncapped cross-sections.
Uses the attached blender-connected-refinement diagnostic, unmodified in vendor_*.py.
No asset source or GLB is saved by this script. No exhaustive self-intersection claim.
"""
import bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from vendor_probe_internal_surfaces import probe,world_triangles
ROOT=HERE.parents[3];OUT=ROOT/'docs/world/quality-v2/static-assembly';OUT.mkdir(exist_ok=True)
report={'method':'all triangle centroids, final Draco fresh import; second epsilon is 10x smaller','assets':[],'limitation':'Generalized winding is diagnostic, not a triangle-intersection proof. Embedded distinct parts intentionally overlap; do not call them welded.'}
for asset in ['C03','C04','C05','C06','C07','C08','C09','C10']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=ROOT/f'public/assets/world/camp/{asset}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    entry={'id':asset,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'normalOffset':probe(objects,max_samples=0),'smallerOffset':probe(objects,max_samples=0,relative_offset=1e-6)}
    tri,_=world_triangles(objects)
    lo=Vector(tri.reshape(-1,3).min(axis=0));hi=Vector(tri.reshape(-1,3).max(axis=0));center=(lo+hi)/2;span=max(hi-lo)
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    me=bpy.data.meshes.new('temporary diagnostic triangles');flat=tri.reshape(-1,3).tolist();me.from_pydata(flat,[],[(i,i+1,i+2) for i in range(0,len(flat),3)]);me.update()
    ob=bpy.data.objects.new(asset+' cutaway only',me);bpy.context.collection.objects.link(ob)
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,center.y,0),plane_no=(0,1,0),clear_outer=True,clear_inner=False)
    bm.to_mesh(me);bm.free();me.update()
    mat=bpy.data.materials.new('diagnostic clay');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.48,.50,1);bs.inputs['Roughness'].default_value=.9;me.materials.append(mat)
    sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE_NEXT';sc.render.resolution_x=900;sc.render.resolution_y=900;sc.render.resolution_percentage=100
    sc.world=bpy.data.worlds.new('neutral');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.6,.6,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    data=bpy.data.cameras.new('inspection');cam=bpy.data.objects.new('inspection',data);sc.collection.objects.link(cam);cam.location=center+Vector((.8,1,.65)).normalized()*span*4;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=span*1.4;sc.camera=cam
    ld=bpy.data.lights.new('softbox','AREA');light=bpy.data.objects.new('softbox',ld);sc.collection.objects.link(light);light.location=center+Vector((2,2,4))*span;ld.energy=900*span*span;ld.shape='DISK';ld.size=span*4;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    sc.render.image_settings.file_format='PNG';sc.render.filepath=str(OUT/f'{asset}-cutaway.png');bpy.ops.render.render(write_still=True)
    entry['cutaway']={'planeWorldY':center.y,'removed':'Y > plane','capped':False,'file':f'{asset}-cutaway.png','note':'Temporary imported display only; open cut boundaries intentional, not exported defects.'};report['assets'].append(entry)
    print('AUDIT',asset,entry['normalOffset']['anomaly_count'],entry['smallerOffset']['anomaly_count'])
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
