import bpy, json
from pathlib import Path
R=Path(__file__).resolve().parents[3]
for kind,ids in [('camp/nature-v4',['G16','G21']),('street',['ST1']),('camp/props',['C09'])]:
 for aid in ids:
  bpy.ops.wm.open_mainfile(filepath=str(R/'tools/world'/kind/'blend'/f'{aid}.blend'))
  rows=[]
  for o in bpy.data.objects:
   if o.type!='MESH':continue
   o.data.calc_loop_triangles()
   rows.append(dict(name=o.name,vertices=len(o.data.vertices),triangles=len(o.data.loop_triangles),materials=[m.name for m in o.data.materials],attrs=[(a.name,a.data_type,a.domain) for a in o.data.attributes],dims=list(o.dimensions)))
  print('PROBE',aid,json.dumps(rows))
