"""G24 rig QA. Two phases in separate Blender processes:
  native: Blender -b blend/G24.blend --python-exit-code 1 -P qa_guide.py -- native OUT.json
  glb:    Blender -b --factory-startup --python-exit-code 1 -P qa_guide.py -- glb GLB NATIVE.json OUT.json
Thresholds follow the rig skill's proposed smoke gates (not official limits); all values reported.
"""
import bpy, bmesh, hashlib, json, math, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
mode = argv[0]
CLIPS = ['Idle', 'Walk', 'Run', 'Jump', 'Land']
DESIGN_V = {'Idle': 0.0, 'Walk': 1.5, 'Run': 4.2, 'Jump': 0.0, 'Land': 0.0}
FPS = 60
H = 1.72
THR = dict(stance_drift_m=0.01 * H, stance_height_dev_m=0.005 * H, penetration_m=0.0025 * H, parity_m=1e-4)
sc = bpy.context.scene
PROBE = [('Idle', 0.0), ('Walk', 0.0), ('Walk', 0.15), ('Walk', 0.3), ('Walk', 0.2583), ('Run', 0.0), ('Run', 0.1),
         ('Run', 0.2083), ('Jump', 0.25), ('Jump', 0.5), ('Land', 0.1)]  # includes off-key subframes


def arm_and_mesh():
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    meshes = [o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)]
    return arm, meshes


def action_for(clip):
    for a in bpy.data.actions:
        if a.name == clip or a.name.startswith(clip + '_') or a.name.split('_')[0] == clip:
            return a
    raise KeyError(clip)


def set_time(arm, clip, t):
    a = action_for(clip)
    arm.animation_data.action = a
    f = a.frame_range[0] + t * FPS
    sc.frame_set(int(math.floor(f + 1e-6)), subframe=(f + 1e-6) % 1.0 if abs(f - round(f)) > 1e-5 else 0.0)


def evaluated(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        out.append(([ev.matrix_world @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons],
                    [p.material_index for p in me.polygons]))
        ev.to_mesh_clear()
    return out


def joints(arm):
    return {b.name: list(arm.matrix_world @ b.head) for b in arm.pose.bones}


def bounds(pts):
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def sole_samples(arm, mesh_data):
    """Boot sole vertex ids per side, chosen in rest pose: lowest boot vertices weighted to foot.X."""
    o = mesh_data
    res = {}
    for tag in ('R', 'L'):
        g = o.vertex_groups.get(f'foot.{tag}')
        ids = [v.index for v in o.data.vertices if any(gg.group == g.index and gg.weight > 0.99 for gg in v.groups)]
        res[tag] = [i for i in ids if o.data.vertices[i].co.z < 0.004]
    return res


if mode == 'native':
    out = argv[1]
    arm, meshes = arm_and_mesh()
    body = meshes[0]
    me = body.data
    R = {'file': bpy.data.filepath, 'blender': bpy.app.version_string}
    # ---- static/weights
    deform = {b.name for b in arm.data.bones if b.use_deform}
    gname = {g.index: g.name for g in body.vertex_groups}
    wstats = dict(vertices=len(me.vertices), unweighted=0, negative=0, max_influences=0, max_sum_error=0.0,
                  non_deform_groups_used=0)
    for v in me.vertices:
        ws = [(gname[g.group], g.weight) for g in v.groups if g.weight > 0]
        wd = [w for n, w in ws if n in deform]
        wstats['non_deform_groups_used'] += sum(1 for n, w in ws if n not in deform)
        if not wd:
            wstats['unweighted'] += 1
        wstats['negative'] += sum(1 for g in v.groups if g.weight < 0)
        wstats['max_influences'] = max(wstats['max_influences'], len(wd))
        wstats['max_sum_error'] = max(wstats['max_sum_error'], abs(sum(wd) - 1) if wd else 1)
    R['weights'] = wstats
    # opposite-limb contamination: no vertex mixes .L and .R limb bones
    mix = 0
    for v in me.vertices:
        ns = {gname[g.group] for g in v.groups if g.weight > 1e-4}
        if any(n.endswith('.L') for n in ns) and any(n.endswith('.R') for n in ns):
            mix += 1
    R['weights']['left_right_mixed_vertices'] = mix
    me.calc_loop_triangles()
    R['triangles'] = len(me.loop_triangles)
    R['bones'] = len(arm.data.bones)
    R['deform_bones'] = len(deform)
    R['materials'] = {m.name: dict(role=m.get('materialRole'), hex=m.get('srgbHex'),
                                   base=[round(c, 5) for c in m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value],
                                   rough=round(m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value, 3),
                                   metal=m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value) for m in me.materials}
    R['transforms'] = {o.name: dict(scale=list(o.scale), loc=list(o.location), rot=list(o.rotation_euler)) for o in (arm, body)}
    # topology of the continuous body shell vs rigid parts
    bm = bmesh.new(); bm.from_mesh(me)
    R['topology'] = dict(boundary_edges=sum(e.is_boundary for e in bm.edges), nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),
                         zero_area_faces=sum(f.calc_area() < 1e-10 for f in bm.faces))
    bm.verts.ensure_lookup_table()
    comp = [-1] * len(bm.verts); nc = 0
    for i in range(len(bm.verts)):
        if comp[i] >= 0: continue
        st = [i]; comp[i] = nc
        while st:
            v = bm.verts[st.pop()]
            for e in v.link_edges:
                o2 = e.other_vert(v).index
                if comp[o2] < 0: comp[o2] = nc; st.append(o2)
        nc += 1
    R['topology']['components'] = nc
    bm.free()
    # ---- rest identity: no action vs rest mesh
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    sc.frame_set(0)
    ev = evaluated([body])[0][0]
    R['rest_identity_max_m'] = max((ev[i] - (body.matrix_world @ me.vertices[i].co)).length for i in range(len(me.vertices)))
    lo, hi = bounds(ev)
    R['rest_bounds_blender'] = dict(min=lo, max=hi, height=hi[2] - lo[2], width_y=hi[1] - lo[1], depth_x=hi[0] - lo[0])
    soles = sole_samples(arm, body)
    boots = {}
    for tag in ('R', 'L'):
        g = body.vertex_groups[f'foot.{tag}']
        boots[tag] = [v.index for v in me.vertices if any(x.group == g.index and x.weight > 0.99 for x in v.groups)]
    # component label per polygon (rest topology): 'body' = continuous skin shell, else the rigid part's bone
    bm2 = bmesh.new(); bm2.from_mesh(me); bm2.verts.ensure_lookup_table()
    comp = [-1] * len(bm2.verts); ncomp = 0
    for i in range(len(bm2.verts)):
        if comp[i] >= 0: continue
        st = [i]; comp[i] = ncomp
        while st:
            vv = bm2.verts[st.pop()]
            for e in vv.link_edges:
                j = e.other_vert(vv).index
                if comp[j] < 0: comp[j] = ncomp; st.append(j)
        ncomp += 1
    bm2.free()
    sizes = [comp.count(c) for c in range(ncomp)]
    body_comp = max(range(ncomp), key=lambda c: sizes[c])
    label = []
    for p in me.polygons:
        c = comp[p.vertices[0]]
        if c == body_comp:
            label.append('body')
        else:
            gs = me.vertices[p.vertices[0]].groups
            label.append('part:' + gname[max(gs, key=lambda g: g.weight).group])
    fsets = [set(p.vertices) for p in me.polygons]

    def crossing_counts(pts, faces):
        tree = BVHTree.FromPolygons(pts, faces, all_triangles=False, epsilon=0.0)
        body_bad, lbl = 0, {}
        for a2, b2 in tree.overlap(tree):
            if a2 >= b2 or (fsets[a2] & fsets[b2]):
                continue
            la, lb = sorted((label[a2], label[b2]))
            if la == lb == 'body':
                body_bad += 1
            elif la != lb:
                lbl[f'{la}|{lb}'] = lbl.get(f'{la}|{lb}', 0) + 1
        return body_bad, lbl

    REST_CROSS, REST_PAIRS = crossing_counts(*evaluated([body])[0][:2])
    R['rest_crossings'] = dict(body_shell=REST_CROSS, part_pairs=REST_PAIRS)

    # ---- per clip sampling
    tree_tris = None
    clip_rep = {}
    samples = {}
    for clip in CLIPS:
        a = action_for(clip)
        n = int(a.frame_range[1] - a.frame_range[0])
        dur = n / FPS
        ts = [i / FPS for i in range(n + 1)] + [(i + 0.5) / FPS for i in range(n)]
        sole_track = {t: {} for t in ts}
        contact_pts = {}
        minz, crossings, worst_vol = 1e9, 0, 0.0
        new_pairs = {}
        samples[clip] = {}
        for t in sorted(ts):
            set_time(arm, clip, t)
            pts, faces, mats = evaluated([body])[0]
            samples[clip][f'{t:.5f}'] = dict(joints=joints(arm), bmin=bounds(pts)[0], bmax=bounds(pts)[1])
            minz = min(minz, min(p.z for p in pts))
            for tag in ('R', 'L'):
                ss = [pts[i] for i in soles[tag]]
                sole_track[t][tag] = (min(p.z for p in ss), sum((p for p in ss), Vector()) / len(ss))
                if abs(t * FPS - round(t * FPS)) < 1e-4:
                    contact_pts[(round(t * FPS), tag)] = {i: pts[i] for i in boots[tag] if pts[i].z < 0.003}
            if abs(t * FPS - round(t * FPS)) < 1e-4:
                c, pairs_lbl = crossing_counts(pts, faces)
                crossings = max(crossings, c)
                for k2, n2 in pairs_lbl.items():
                    if n2 > REST_PAIRS.get(k2, 0):
                        new_pairs[k2] = max(new_pairs.get(k2, 0), n2)
        # contact: declared stance intervals (authored mask stored on the action by build_guide.py)
        drift, hdev, stance_frames = 0.0, 0.0, 0
        v = DESIGN_V[clip]
        for tag in ('R', 'L'):
            m = list(a.get('contact' + tag, []))
            seq = [(i / FPS, sole_track[i / FPS][tag]) for i in range(n + 1)]
            run = []
            for i, (t, (z, c)) in enumerate(seq + [(None, (None, None))]):
                if t is not None and i < len(m) and m[i]:
                    run.append((t, z, c))
                    hdev = max(hdev, abs(z))
                    stance_frames += 1
                else:
                    if len(run) >= 2:
                        x0 = run[0][2].x + v * run[0][0]
                        for tt, zz, cc in run:
                            drift = max(drift, abs((cc.x + v * tt) - x0))
                    run = []
        # per-vertex slip: a boot vertex touching the ground (<3 mm) in consecutive frames must not move
        # horizontally once the in-place treadmill speed v is added back (virtual world position).
        slip, slip_cum, cont = 0.0, 0.0, {}
        for f in range(n + 1):
            for tag in ('R', 'L'):
                cur = contact_pts.get((f, tag), {})
                prev = contact_pts.get((f - 1, tag), {})
                for i, p in cur.items():
                    wx = p.x + v * f / FPS
                    if i in prev:
                        px = prev[i].x + v * (f - 1) / FPS
                        slip = max(slip, math.hypot(wx - px, p.y - prev[i].y))
                        x0, y0 = cont[(tag, i)]
                        slip_cum = max(slip_cum, math.hypot(wx - x0, p.y - y0))
                    else:
                        cont[(tag, i)] = (wx, p.y)
        rec = dict(frames=n, duration_s=dur, design_speed_mps=v, min_skin_z_m=minz, penetration_m=max(0.0, -minz),
                   stance_frames=stance_frames, sole_centroid_drift_virtual_world_m=drift, stance_lowest_sole_height_dev_m=hdev,
                   contact_vertex_slip_per_frame_max_m=slip, contact_vertex_slip_cumulative_max_m=slip_cum,
                   body_shell_self_crossing_pairs_max=crossings, body_shell_rest_crossing_pairs=REST_CROSS,
                   part_pairs_exceeding_rest=new_pairs)
        if a.get('loop', clip in ('Idle', 'Walk', 'Run')):
            set_time(arm, clip, 0.0); j0 = joints(arm)
            set_time(arm, clip, dur); j1 = joints(arm)
            set_time(arm, clip, 1 / FPS); jn = joints(arm)
            set_time(arm, clip, dur - 1 / FPS); jp = joints(arm)
            rec['loop_position_error_m'] = max((Vector(j0[k]) - Vector(j1[k])).length for k in j0)
            rec['loop_velocity_jump_mps'] = max(((Vector(jn[k]) - Vector(j0[k])) - (Vector(j1[k]) - Vector(jp[k]))).length * FPS for k in j0)
            # same frame-to-frame velocity change measured at every interior frame, for comparison
            J = []
            for i in range(n + 1):
                set_time(arm, clip, i / FPS); J.append(joints(arm))
            rec['interior_velocity_change_max_mps'] = max(((Vector(J[i + 1][k]) - Vector(J[i][k])) - (Vector(J[i][k]) - Vector(J[i - 1][k]))).length * FPS
                                                          for i in range(1, n) for k in J[0])
        clip_rep[clip] = rec
    R['clips'] = clip_rep
    # stress pose: deepest knee and highest arm from all samples are already included; add explicit squat/arm-up
    R['thresholds'] = THR
    R['samples'] = samples
    # deformed vertex clouds at representative poses for a bidirectional surface comparison with the GLB
    R['clouds'] = {}
    for clip, t in PROBE:
        set_time(arm, clip, t)
        R['clouds'][f'{clip}@{t:.4f}'] = [list(p) for p in evaluated([body])[0][0]]
    json.dump(R, open(out, 'w'), indent=1)
    print('NATIVE_QA', json.dumps({k: v for k, v in R.items() if k not in ('samples', 'materials', 'transforms')})[:3000])

else:
    glb, native_json, out = argv[1], argv[2], argv[3]
    N = json.load(open(native_json))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene          # factory reset replaces the scene object
    sc.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=glb)
    arm, meshes = arm_and_mesh()
    R = dict(glb=glb, sha256=hashlib.sha256(open(glb, 'rb').read()).hexdigest(), blender=bpy.app.version_string,
             objects=[(o.name, o.type) for o in sc.objects], actions=sorted(a.name for a in bpy.data.actions))
    dg = bpy.context.evaluated_depsgraph_get()
    tri = 0
    for o in meshes:
        ev = o.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles(); tri += len(m.loop_triangles); ev.to_mesh_clear()
    R['triangles'] = tri
    R['triangles_equal_native'] = tri == N['triangles']
    R['bones'] = len(arm.data.bones)
    mats = {}
    for o in meshes:
        for m in o.data.materials:
            b = m.node_tree.nodes.get('Principled BSDF')
            mats[m.name] = dict(base=[round(c, 5) for c in b.inputs['Base Color'].default_value], rough=round(b.inputs['Roughness'].default_value, 3),
                                metal=b.inputs['Metallic'].default_value, role=m.get('materialRole'))
    R['materials'] = mats
    R['material_mismatch'] = [k for k, v in N['materials'].items() if k not in mats or
                              max(abs(a - b) for a, b in zip(v['base'], mats[k]['base'])) > 2e-3 or
                              abs(v['rough'] - mats[k]['rough']) > 2e-3 or abs(v['metal'] - mats[k]['metal']) > 1e-6]
    # pose parity: joints at keys and half frames; deformed bounds
    worst_key, worst_half, worst_bounds = 0.0, 0.0, 0.0
    imported_clips = {}
    for clip in CLIPS:
        a = action_for(clip)
        imported_clips[clip] = [a.name, list(a.frame_range)]
        for tk, s in N['samples'][clip].items():
            t = float(tk)
            set_time(arm, clip, t)
            j = joints(arm)
            e = max((Vector(j[k]) - Vector(v)).length for k, v in s['joints'].items() if k in j)
            if abs(t * FPS - round(t * FPS)) < 1e-4:
                worst_key = max(worst_key, e)
            else:
                worst_half = max(worst_half, e)
            pts = [p for d in evaluated(meshes) for p in d[0]]
            lo, hi = bounds(pts)
            worst_bounds = max(worst_bounds, max(abs(a2 - b2) for a2, b2 in zip(lo + hi, s['bmin'] + s['bmax'])))
    R['imported_clips'] = imported_clips
    R['joint_parity_keyframes_max_m'] = worst_key
    R['joint_parity_halfframes_max_m'] = worst_half
    R['deformed_bounds_parity_max_m'] = worst_bounds
    from mathutils.kdtree import KDTree
    worst_cloud = {}
    for key, cloud in N['clouds'].items():
        clip, t = key.split('@')
        set_time(arm, clip, float(t))
        imp = [p for d in evaluated(meshes) for p in d[0]]
        kn = KDTree(len(cloud)); [kn.insert(Vector(p), i) for i, p in enumerate(cloud)]; kn.balance()
        ki = KDTree(len(imp)); [ki.insert(p, i) for i, p in enumerate(imp)]; ki.balance()
        a2b = max(ki.find(Vector(p))[2] for p in cloud)
        b2a = max(kn.find(p)[2] for p in imp)
        worst_cloud[key] = dict(native_to_glb_max_m=a2b, glb_to_native_max_m=b2a, native_vertices=len(cloud), glb_vertices=len(imp))
    R['deformed_vertex_cloud_parity'] = worst_cloud
    R['deformed_vertex_cloud_parity_max_m'] = max(max(v['native_to_glb_max_m'], v['glb_to_native_max_m']) for v in worst_cloud.values())
    R['non_asset_import_objects'] = [o.name for o in sc.objects if o.type == 'MESH' and o not in meshes]
    json.dump(R, open(out, 'w'), indent=1)
    print('GLB_QA', json.dumps(R)[:2500])
