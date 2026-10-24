"""P05/P19/F04 light-wood-standing-sign family; Blender -Y front, bottom-centred, metres.
Budget: 2160 evaluated triangles for three sizes; pegged frame joints are embedded, not welded.
"""
import os, sys
sys.path.insert(0, os.path.join(os.getcwd(), 'tools/world/park'))
from parklib import *
import parklib
parklib.EVIDENCE = '/Users/bobby/Desktop/3D-personal-world/evidence/park-integration'

def sign(name, w, h, z0):
    p = Part('body_' + name)
    f, t, pw = 0.065, 0.065, 0.085
    # Board is shallow: cream inset, wooden rim, drip cap with pitched crown.
    p.add(box((-w/2, -t/2, z0), (w/2, t/2, z0+h), bevel=.009), 'park_cream_paint')
    for x in (-w/2-pw*.15, w/2+pw*.15):
        p.add(box((x-pw/2, -.054, 0), (x+pw/2, .054, z0+h+.1), bevel=.01), 'park_wood_light')
        # Foot spreads toward front/back, brace, pegged tenon at rail contact.
        p.add(box((x-.075, -.29, 0), (x+.075, .29, .07), bevel=.014), 'park_wood_mid')
        for yy in (-.23,.23):
            p.add(strut((x, yy, .07), (x, 0, .45), .023, .023, 6), 'park_wood_mid')
        for z in (z0+.08,z0+h-.08):
            p.add(strut((x, -.064, z), (x, -.046, z), .013, .013, 10), 'park_wood_dark')
    for z in (z0-f/2,z0+h+f/2):
        p.add(box((-w/2-f, -.053, z-f/2), (w/2+f, .053, z+f/2), bevel=.009), 'park_wood_light')
    for x in (-w/2-f/2,w/2+f/2):
        p.add(box((x-f/2, -.054, z0), (x+f/2, .054, z0+h), bevel=.008), 'park_wood_light')
    # Shallow tent cap, external profile needs only two sloped faces.
    p.add(prism([(-.095,z0+h+f),(.095,z0+h+f),(.095,z0+h+f+.025),(0,z0+h+f+.055),(-.095,z0+h+f+.025)], -w/2-f-.035,w/2+f+.035,'X',bevel=.005), 'park_wood_mid')
    p.add(box((-w/2-.03,.035,z0+.06),(w/2+.03,.075,z0+.12),bevel=.006), 'park_wood_mid')
    root=make_root(name,{'assetId':name,'family':'light-wood-standing-sign','front':'+Z glTF','solidNodes':['body_'+name], 'panelM':[w,h,z0], 'collision':'GLB-derived fixed trimesh'})
    return root,make_object(p,root)

reset_scene()
roots=[]; objs=[]
for args in [('P05',2.4,1.3,1.0),('P19',1.1,.72,.7),('F04',.78,.46,.55)]:
    root,obj=sign(*args); roots.append(root); objs.append(obj)
ev=inspect(objs)
blend,glb=export('signs',roots)
rb=readback(glb)
report={'asset':'P05+P19+F04','evaluatedTriangles':ev['triangles'],'bounds':[ev['bounds_min'],ev['bounds_max']], 'problems':ev['problems'],'parts':ev['objects'],'glbReadbackTriangles':rb['triangles'],'readbackBounds':[rb['bounds_min'],rb['bounds_max']],'readbackProblems':rb['problems'],'glbBytes':os.path.getsize(glb),'qaNote':'GLB raw normal/material seams retained. Topology diagnostic welds a disposable imported copy at 1e-5m, as in parklib.'}
write_json(os.path.join(REPO,'docs/world/park/qa-signs.json'),report)
report['variants']={name:{'root':name,'body':'body_'+name,'panel':[w,h,z0],'frontFaceGLB':[0,z0+h/2,.0325],'textFaceGLB':[0,z0+h/2,.034],'panelInset':.015} for name,w,h,z0 in [('P05',2.4,1.3,1.0),('P19',1.1,.72,.7),('F04',.78,.46,.55)]}
write_json(os.path.join(REPO,'docs/world/park/qa-signs.json'),report)
print('signs',ev['triangles'],rb['triangles'],'problems',len(ev['problems']),len(rb['problems']))
if '--render' in ARGS:
    os.makedirs(parklib.EVIDENCE+'/signs',exist_ok=True)
    for ob in list(bpy.context.scene.objects):
        if ob.type == 'MESH' and (not ob.parent or ob.parent.name != 'F04'): bpy.data.objects.remove(ob, do_unlink=True)
    render_views([o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent and o.parent.name=='F04'],parklib.EVIDENCE+'/signs/F04',views=('34_front','side'),res=900)
