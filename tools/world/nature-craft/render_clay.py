"""Read-only clay pairs; do not save native files or export runtime assets."""
import bpy, importlib.util, math, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;R=HERE.parents[2]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=module('batch4_props',HERE/'build_props.py');T=module('batch4_trees',HERE/'build_trees.py')
def clay():
 m=P.U.material('Review clay | neutral geometry only','939996',.83)
 bpy.context.scene.view_layers[0].material_override=m
for aid,old in ([] if '--grass-only' in sys.argv else [('C09',R/'tools/world/camp/props/blend/C09.blend'),('G17',R/'tools/world/camp/nature-v4/blend/G17.blend')]):
 for stage,path in [('clay-before',old),('clay-after',HERE/'blend'/f'{aid}.blend')]:
  bpy.ops.wm.open_mainfile(filepath=str(path));clay()
  if aid=='C09':P.rig_render(aid+'-'+stage,(0,0,.84),2.15)
  else:T.render(aid,stage)
for old in [True,False]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 if old:
  c=P.U.collection('Old grass | exact production formula reconstruction')
  for k in range(5):
   a=k/5*math.tau+.7*(k%2);r=.03+.05*((k*7)%3)/2;lean=.16+.1*((k*3)%2);h=.42*(.7+.3*((k*5)%4)/3)
   bx,bz=math.cos(a)*r,math.sin(a)*r;dx,dz=math.cos(a)*lean,math.sin(a)*lean;tx,tz=-math.sin(a)*.035,math.cos(a)*.035
   v=[(bx-tx,0,bz-tz),(bx+tx,0,bz+tz),(bx-tx*.7+dx*.35,h*.55,bz-tz*.7+dz*.35),(bx+tx*.7+dx*.35,h*.55,bz+tz*.7+dz*.35),(bx+dx,h,bz+dz)]
   m=P.U.material('Old blade','8aa24a',.95);m.use_backface_culling=False
   P.U.mesh('Old blade %d'%k,[(x,-z,y) for x,y,z in v],[(0,1,3),(0,3,2),(2,3,4)],m,c)
 else:bpy.ops.wm.open_mainfile(filepath=str(HERE/'blend/grass.blend'))
 P.rig_render('grass-before' if old else 'grass-native',(0,0,.2),1.0)
 clay();P.rig_render('grass-clay-'+('before' if old else 'after'),(0,0,.2),1.0)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(R/'public/assets/world/nature-craft/grass.glb'))
P.rig_render('grass-fresh',(0,0,.2),1.0)
print('CLAY PAIRS COMPLETE | native and GLB files untouched')
