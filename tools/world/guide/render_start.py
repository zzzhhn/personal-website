"""Cheap StartRun review, first at dynamic-similarity time then current body travel.
Rejected sources can be rendered as evidence; this is NOT runtime acceptance.
Usage: blender --background --python render_start.py -- SRC.blend OUT_DIR
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(src));sc=bpy.context.scene;arm=bpy.data.objects['G24'];body=bpy.data.objects['G24_mesh']
for tr in arm.animation_data.nla_tracks:tr.mute=True
act=bpy.data.actions['StartRun'];arm.animation_data.action=act
roots=list(act['rootDistance']);n=len(roots)-1
for ob in list(sc.objects):
    if ob not in (arm,body):ob.hide_render=True
mover=bpy.data.objects.new('StartRoot',None);sc.collection.objects.link(mover);arm.parent=mover
# Floor grid is actual coloured geometry because Workbench doesn't evaluate nodes.
for i in range(-8,9):
    for j in range(-3,4):
        bpy.ops.mesh.primitive_plane_add(size=.5,location=(i*.5,j*.5,-.003))
        tile=bpy.context.object;tile.color=(.42,.44,.46,1) if (i+j)%2 else (.58,.60,.62,1)
for mat in bpy.data.materials:
    if mat.use_nodes and 'Principled BSDF' in mat.node_tree.nodes:
        mat.diffuse_color=mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value
# Per-object colour for floor, material for character.
sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='MATERIAL'
for ob in sc.objects:
    if ob.type=='MESH' and ob!=body:
        m=bpy.data.materials.new('floor');m.diffuse_color=ob.color;ob.data.materials.append(m)
sc.display.shading.show_shadows=True;sc.display.shading.show_cavity=False
w=bpy.data.worlds.new('StartWorld');w.color=(.68,.71,.74);sc.world=w;sc.display.shading.background_type='WORLD'
sc.view_settings.view_transform='Standard';sc.render.resolution_x=960;sc.render.resolution_y=720;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.fps=30
cam=bpy.data.objects.new('StartCamera',bpy.data.cameras.new('StartCamera'));sc.collection.objects.link(cam);sc.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=2.7
direction=Vector((.8,-1,.28)).normalized();focus=Vector((.18,0,.77));cam.location=focus+direction*8;cam.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
sc.render.use_stamp=True;sc.render.use_stamp_note=True;sc.render.use_stamp_frame=False
for k in ['date','time','render_time','camera','lens','scene','filename']:setattr(sc.render,'use_stamp_'+k,False)
normalDuration=float(act.get('authorDuration',n/60))
# Existing physical response for an optional diagnostic; not an authorised retime.
def distance(t):return 3.6*(t-(1-math.exp(-12*t))/12)
lo,hi=0.,3.
for _ in range(60):
    mid=(lo+hi)/2
    if distance(mid)<roots[-1]:lo=mid
    else:hi=mid
actualDuration=(lo+hi)/2
index=0;mapping=[]
for mode,duration in [('similarity',normalDuration)]:
    for frame in range(math.ceil((duration+.4)*30)):
        t=max(0,min(duration,frame/30-.2))
        if mode=='similarity':x=t/duration*n;d=None
        else:
            d=min(roots[-1],distance(t));i=next((j for j in range(n) if roots[j+1]>=d),n-1)
            x=i+(d-roots[i])/max(1e-9,roots[i+1]-roots[i])
        i=min(n-1,int(x));a=x-i
        d=roots[i]*(1-a)+roots[i+1]*a
        sc.frame_set(int(x),subframe=x-int(x));mover.location=(d,0,0)
        cam.location=focus+Vector((d,0,0))+direction*8
        sc.render.stamp_note_text=f'{act.get("sourceTake","source")} | STRICT SIMILARITY CANDIDATE | {duration:.3f}s | not runtime accepted'
        sc.render.filepath=str(out/f'{index:04d}.png');bpy.ops.render.render(write_still=True)
        mapping.append(dict(outputFrame=index,mode=mode,t=t,clipFrame=x,root=d));index+=1
json.dump(dict(source=str(src),normalDuration=normalDuration,bodyDuration=actualDuration,rootDistance=roots[-1],frames=mapping),open(out/'mapping.json','w'),indent=1)
print('START_ANIMATIC_FRAMES',index,out)
