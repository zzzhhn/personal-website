"""Collect final G24 evidence into docs/world/quality-v2/guide/manifest.json (plain python3)."""
import hashlib, json, os
# Repo root derived from this file; G24_REPO overrides. Never a hard-coded checkout (worktrees).
REPO = os.environ.get('G24_REPO') or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
T = f'{REPO}/tools/world/guide/out'
D = f'{REPO}/docs/world/quality-v2/guide'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
N = json.load(open(f'{T}/qa_native.json'))
Gu = json.load(open(f'{T}/qa_glb_G24_uncompressed.json'))
Gd = json.load(open(f'{T}/qa_glb_G24.json'))
W = json.load(open(f'{T}/qa_wrist.json'))
I = json.load(open(f'{T}/inspect_glb_rig_uncompressed.json'))
Id = json.load(open(f'{T}/inspect_glb_rig_draco.json'))
B = json.load(open(f'{T}/build_report.json'))
final = f'{REPO}/public/assets/world/guide/G24.glb'
unc = f'{T}/G24_uncompressed.glb'
THR = N['thresholds']
A6 = f'{REPO}/docs/world/quality-v2/guide/final/a6'
SX = {k: json.load(open(f'{A6}/selfx_{k}.json')) for k in ('native', 'glb_uncompressed', 'glb_draco')}
RL = {k: json.load(open(f'{A6}/relations_{k}.json')) for k in ('native', 'glb_uncompressed', 'glb_draco')}
MT = {k: json.load(open(f'{A6}/mainthread_checker_{k}_strict_allshells.json')) for k in ('native', 'uncompressed', 'draco')}


def sx_summary(R):
    from collections import Counter
    c = Counter()
    for s_ in R['samples']:
        for k, v in s_['classification'].items():
            if k.endswith(('crossing', 'no_witness', 'vertex_contact_exact')):
                c[k] += v
    return dict(source=R['source'], samples=R['total_samples'], samples_with_strict_crossings=R['samples_with_strict_crossings'],
                worst_per_clip={k: v['n'] for k, v in R['worst_body_shell_per_clip'].items()},
                legacy_nonadjacent_max=max(s_['body_shell_nonadjacent_tri_pairs'] for s_ in R['samples']),
                resolved_and_failing_pair_totals=dict(c))


def idle_bounds():
    s = N['samples']['Idle']
    lo = [min(v['bmin'][i] for v in s.values()) for i in range(3)]
    hi = [max(v['bmax'][i] for v in s.values()) for i in range(3)]
    return dict(blender_min=lo, blender_max=hi, glb_xyz=[hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]])


clips = {}
for c, r in N['clips'].items():
    rec = dict(r)
    rec['status'] = {
        'penetration': 'executed_pass' if r['penetration_m'] <= THR['penetration_m'] else 'executed_fail',
        'contact_slip_cumulative': 'executed_pass' if r['contact_vertex_slip_cumulative_max_m'] <= THR['stance_drift_m'] else 'executed_fail',
        'sole_centroid_drift': 'executed_pass' if r['sole_centroid_drift_virtual_world_m'] <= THR['stance_drift_m'] else 'executed_fail',
    }
    clips[c] = rec
man = dict(
    id='G24', name='guide B (helmet + visor), L1 script-built candidate', date='2026-10-21', blender=N['blender'],
    source='Script-authored mesh, 18-bone rig, procedural weights and clips (not Mixamo, not Hy3D).',
    files=dict(final_draco=dict(path='public/assets/world/guide/G24.glb', bytes=os.path.getsize(final), sha256=sha(final)),
               uncompressed_proof=dict(path='tools/world/guide/out/G24_uncompressed.glb', bytes=os.path.getsize(unc), sha256=sha(unc)),
               native='tools/world/guide/blend/G24.blend'),
    contract=dict(units='m', up='+Y', front='+X', right='+Z (bag and cyan dot, per text lock)', sole='local y=0',
                  root='origin under the feet', runtime_offset='-(PLAYER_RADIUS + PLAYER_HALF_HEIGHT) = -0.82 m',
                  clips_in_place=True, fps=60),
    dimensions=dict(rest_A_pose_glb_xyz=[N['rest_bounds_blender']['depth_x'], N['rest_bounds_blender']['height'], N['rest_bounds_blender']['width_y']],
                    idle_envelope=idle_bounds(), target_height_m=1.72, note='Actual height 1.708 m (helmet top).'),
    triangles=dict(native=N['triangles'], uncompressed_glb=Gu['triangles'], draco_glb_reimport=Gd['triangles'],
                   declared_budget='3000-5000 (plan)',
                   baseline=dict(triangles=348, ratio=round(N['triangles'] / 348, 3),
                                 source='c507506 WorldActors runtime placeholder (capsule + sphere + 3 boxes), rebuilt with the same three version and counted by the main thread; not an earlier GLB'),
                   note=f"Final is {N['triangles']:,} (r3 was 2,006): r5 boots are 8-sided shaft + toe box (fewer faces than the r4 skin boot); the hem cut adds a loop. Below the declared budget; no geometry was added to reach it."),
    rig=dict(type='custom-L1', bones=N['bones'], deform_bones=N['deform_bones'], weights=N['weights'], rest_identity_max_m=N['rest_identity_max_m']),
    topology=dict(native=N['topology'], shells='1 continuous body skin + 10 rigid one-hot parts (helmet, visor, dot, 2 boots, 2 mittens, bag, bag flap, zip)'),
    clips=dict(build=B['clips'], measured=clips, thresholds=THR,
               threshold_source='rig skill proposed smoke gates (1% height drift, 0.5% height sole deviation, 0.25% height penetration); not official limits'),
    export_parity=dict(
        uncompressed=dict(sha256=Gu['sha256'], **{k: Gu[k] for k in ('triangles_equal_native', 'material_mismatch', 'joint_parity_keyframes_max_m', 'joint_parity_halfframes_max_m', 'deformed_bounds_parity_max_m', 'deformed_vertex_cloud_parity_max_m', 'imported_clips', 'non_asset_import_objects')}),
        draco=dict(sha256=Gd['sha256'], **{k: Gd[k] for k in ('triangles_equal_native', 'material_mismatch', 'joint_parity_keyframes_max_m', 'joint_parity_halfframes_max_m', 'deformed_bounds_parity_max_m', 'deformed_vertex_cloud_parity_max_m', 'imported_clips', 'non_asset_import_objects')}),
        skill_inspector_uncompressed=dict(passed=I['passed'], errors=I['errors'], warnings=I['warnings'], clips=I['clips'],
                                          max_influences=max(p['max_influences'] for p in I['skin_primitives']),
                                          max_weight_sum_error=max(p['max_weight_sum_error'] for p in I['skin_primitives'])),
        skill_inspector_draco=dict(passed=Id.get('passed'), errors=Id.get('errors'), note='Inspector does not decode Draco; final Draco file is verified by fresh Blender import parity instead.')),
    jump_contact_interpretation=dict(
        offline='Jump cumulative contact-vertex slip 35.0 mm at take-off exceeds the 17.2 mm smoke gate: executed_fail (kept).',
        runtime='Main thread motion-r4: all 20 real Jump samples were airborne, lowest sole 25.8 cm above real ground, so this is not observed as foot sliding in play. See main-thread jump-contact-interpretation.json.'),
    wrist=dict(sha256=W['sha256'], rest=W['samples']['rest'], worst_over_all_clip_frames=W['worst_over_all_clip_frames'], method=W['method']),
    a6=dict(
        spec='Fable 验收-营地返工-20261021.md, A6 object scope (fixed-continuous / embedded-distinct / articulated + unintended=0)',
        fixed_continuous=dict(checker='tools/world/guide/qa_selfx.py + selfx_core.py (strict adjacency + exact shared-vertex test)',
                              native=sx_summary(SX['native']), glb_uncompressed=sx_summary(SX['glb_uncompressed']), glb_draco=sx_summary(SX['glb_draco']),
                              mainthread_checker={k: dict(source_sha256=v['source_sha256'], rest=len(v['rest']),
                                                          clips={c: dict(samples=r['samples'], unresolved_or_confirmed_max=max(x['raw_pairs'] for x in r['rows']),
                                                                         exact_shared_vertex_contacts_max=max(x['exact_shared_vertex_contacts'] for x in r['rows']))
                                                                 for c, r in v['clips'].items()}) for k, v in MT.items()}),
        relation_table=RL['glb_draco']['relations_declared'],
        relations={k: dict(source=v['source'], passed=v['passed'], samples=v['total_samples'], summary=v['relation_summary'],
                           unintended_max_per_pair=v['unintended_max_per_pair'], samples_with_unintended=v['samples_with_unintended'],
                           cross_shell_no_witness_samples=v['samples_with_no_witness']) for k, v in RL.items()},
        unintended_classes=RL['glb_draco']['unintended_named_classes'],
        limits='float32 evaluated coordinates; integer + half frames only (no continuous collision); burial/exposure by closest-face normal sign on sampled surface points; mixed runtime blends not tested here',
        reports='docs/world/quality-v2/guide/final/a6/'),
    materials=N['materials'],
    evidence=dict(sixview='docs/world/quality-v2/guide/final/G24_sixview_final.png',
                  poses='docs/world/quality-v2/guide/final/G24_poses_final.png',
                  wrist_closeups='docs/world/quality-v2/guide/final/G24_wrist_closeups_final.png',
                  a6_extreme_closeups='docs/world/quality-v2/guide/final/G24_a6_extremes_final.png',
                  a2_vs_lock='docs/world/quality-v2/guide/final/G24_A2_vs_lock.png',
                  video='docs/world/quality-v2/guide/final/video/G24_10s_normal_speed.mp4',
                  video_contact='docs/world/quality-v2/guide/final/video/frames/contact_2fps.png',
                  all_rendered_from='fresh import of the final Draco GLB (hash in each source.txt)'),
    previous_finals=dict(d3ccc591='r3 final, replaced (A6 fail: 16-48 strict crossings per clip); backup tools/world/guide/out/G24_d3ccc591_final_backup.glb',
                         **{'49bd64ff': 'r4 A6 milestone, replaced for A2 (V hem, round boot); backup tools/world/guide/out/G24_49bd64ff_final_backup.glb'}),
    acceptance=dict(machine='see per-check status in README', reviewer_visual='Codex self-review only', fable='pending', user='pending'),
)
json.dump(man, open(f'{D}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('MANIFEST', man['files']['final_draco'], man['triangles'], man['dimensions']['idle_envelope']['glb_xyz'])
