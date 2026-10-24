"""Street ST1/ST2: reuse nature-v4 branch/leaf pipeline; author L0 + 23% L1. Blender Z-up, Y-up GLB."""
import bpy, os, sys, importlib.util, json, copy
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__)); REPO=os.path.abspath(os.path.join(HERE,'../../..'))
p=os.path.join(REPO,'tools/world/camp/nature-v4/build_nature_v4.py')
spec=importlib.util.spec_from_file_location('nature_street',p); n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
n.BLEND_DIR=os.path.join(HERE,'blend'); n.GLB_DIR=os.path.join(REPO,'public/assets/world/street')
rows={}
for source,aid,target in [('G17','ST1',4400),('G18','ST2',4700)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    n.TARGET[source]=target
    spec=copy.deepcopy(n.TREES[source]); spec['seed']+=101
    spec['title']='coastal spreading crown' if aid=='ST1' else 'tall forked street crown'
    root,objs=n.finish_tree(source,spec); root.name=aid;root['assetId']=aid
    for ob in objs:
        role=ob.name;ob.name='L0-'+role
        if role=='trunk':
            for face in ob.data.polygons:face.use_smooth=True
        lo=ob.copy();lo.data=ob.data.copy();bpy.context.scene.collection.objects.link(lo);lo.parent=root;lo.name='L1-'+role
        bpy.context.view_layer.objects.active=lo
        mod=lo.modifiers.new('silhouette LOD','DECIMATE');mod.ratio=.23
        bpy.ops.object.modifier_apply(modifier=mod.name)
    n.export(root,aid)
    def stats():
        out={}
        for ob in bpy.context.scene.objects:
            if ob.type!='MESH':continue
            ob.data.calc_loop_triangles();pts=[ob.matrix_world@v.co for v in ob.data.vertices]
            out[ob.name]={'triangles':len(ob.data.loop_triangles),'bounds':[[min(p[k] for p in pts) for k in range(3)],[max(p[k] for p in pts) for k in range(3)]], 'degenerate':sum(t.area<1e-10 for t in ob.data.loop_triangles),'wind':ob.data.attributes.get('_WIND') is not None}
        return out
    native=stats(); leafcount=root.get('leafCount')
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=os.path.join(n.GLB_DIR,aid+'.glb'))
    final=stats()
    rows[aid]={'native':native,'roundtrip':final,'leafCount':leafcount,'source':source,'openLeaves':'intentional folded double-sided leaf cards; branch shells closed','collider':'L0-trunk geometry, exact instance transform'}
    print('STREET TREE',aid,json.dumps(rows[aid]))
os.makedirs(os.path.join(REPO,'docs/world/street'),exist_ok=True)
with open(os.path.join(REPO,'docs/world/street/trees-qa.json'),'w') as f:json.dump(rows,f,indent=2)
