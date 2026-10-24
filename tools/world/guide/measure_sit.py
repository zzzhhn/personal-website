"""Measure the G24 seated contact from a fresh GLB import (SitIdle mid frame): buttock underside (lowest body-skin
vertex behind the knees, above the shins) height and x, feet sole height. Writes out/sit_measure.json.
Run: blender-run.sh character tools/world/guide/measure_sit.py GLB"""
import bpy, json, os, sys
glb = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; sc.render.fps = 60
arm = next(o for o in sc.objects if o.type == 'ARMATURE'); me = next(o for o in sc.objects if o.type == 'MESH')
ad = arm.animation_data or arm.animation_data_create()
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
ACT = {a.name.split('_')[0]: a for a in bpy.data.actions}
res = {}
for clip, fr in (('SitIdle', 0.5), ('SitDown', 1.0), ('StandUp', 0.0)):
    a = ACT[clip]; ad.action = a; f = a.frame_range[0] + fr * (a.frame_range[1] - a.frame_range[0]); sc.frame_set(int(f))
    dg = bpy.context.evaluated_depsgraph_get(); ev = me.evaluated_get(dg); m = ev.to_mesh()
    W = me.matrix_world
    pts = [W @ v.co for v in m.vertices]
    vg = {g.index: g.name for g in me.vertex_groups}
    def dom(i):
        gs = me.data.vertices[i].groups
        return vg[max(gs, key=lambda g: g.weight).group] if gs else ''
    # glTF import: Blender Z up, glTF +X forward stays +X; buttock = thigh/pelvis-dominant verts with x <= knee-ish
    body = [(i, p) for i, p in enumerate(pts) if dom(i) in ('pelvis', 'thigh.L', 'thigh.R', 'bag')]
    low = min(body, key=lambda ip: ip[1].z)
    seatpts = [p for i, p in body if p.z < low[1].z + 0.02]
    sole = min(p.z for i, p in enumerate(pts) if dom(i).startswith('foot'))
    footx = [p.x for i, p in enumerate(pts) if dom(i).startswith('foot')]
    res[clip] = dict(buttock_z=round(low[1].z, 4), buttock_x_range=[round(min(p.x for p in seatpts), 3), round(max(p.x for p in seatpts), 3)],
                     sole_z=round(sole, 4), foot_x=[round(min(footx), 3), round(max(footx), 3)])
    ev.to_mesh_clear()
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'sit_measure.json')
json.dump(res, open(out, 'w'), indent=1); print('SIT', json.dumps(res))
