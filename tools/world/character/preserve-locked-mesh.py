"""Transfer only the three retargeted seated Actions into the exact preserved locked native asset.
Keep native mesh/weights/rest skeleton from the pre-seat-back snapshot instead of relying on full
generator reproducibility. The final Draco primitive bytes are checked against that snapshot.
"""
import bpy,sys
from pathlib import Path
base=Path('/Users/bobby/Desktop/3D-personal-world/evidence/character-close')
repo=Path(__file__).resolve().parents[3]
candidate=base/'seated-actions-candidate.blend'
bpy.ops.wm.open_mainfile(filepath=str(repo/'tools/world/guide/blend/G24.blend'))
bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
bpy.ops.wm.open_mainfile(filepath=str(base/'pre-seat-back/G24.blend'))
names={'SitDown','SitIdle','StandUp'}
for a in list(bpy.data.actions):
 if a.name in names:bpy.data.actions.remove(a,do_unlink=True)
with bpy.data.libraries.load(str(candidate),link=False)as(a,b):b.actions=[n for n in a.actions if n in names]
arm=bpy.data.objects['G24'];ad=arm.animation_data
for tr in ad.nla_tracks:
 if tr.name in names:
  for st in tr.strips:st.action=bpy.data.actions[tr.name]
bpy.ops.wm.save_as_mainfile(filepath=str(repo/'tools/world/guide/blend/G24.blend'))
print('PRESERVED',sum(len(o.data.polygons)for o in bpy.data.objects if o.type=='MESH'))
