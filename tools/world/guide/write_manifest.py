"""Collect final G24 evidence into docs/world/quality-v2/guide/manifest.json (plain python3)."""
import hashlib, json, os
REPO = '/Users/bobby/WorkBuddy/personal-website/personal-website'
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
                   declared_budget='3000-5000 (plan)', note='Final is 2,006, below the declared budget; no geometry was added to reach it. No prior formal asset exists as a baseline.'),
    rig=dict(bones=N['bones'], deform_bones=N['deform_bones'], weights=N['weights'], rest_identity_max_m=N['rest_identity_max_m']),
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
    wrist=dict(sha256=W['sha256'], rest=W['samples']['rest'], worst_over_all_clip_frames=W['worst_over_all_clip_frames'], method=W['method']),
    materials=N['materials'],
    evidence=dict(sixview='docs/world/quality-v2/guide/final/G24_sixview_final.png',
                  poses='docs/world/quality-v2/guide/final/G24_poses_final.png',
                  wrist_closeups='docs/world/quality-v2/guide/final/G24_wrist_closeups_final.png',
                  video='docs/world/quality-v2/guide/final/video/G24_10s_normal_speed.mp4',
                  video_contact='docs/world/quality-v2/guide/final/video/frames/contact_2fps.png',
                  all_rendered_from='fresh import of the final Draco GLB (hash in each source.txt)'),
    acceptance=dict(machine='see per-check status in README', reviewer_visual='Codex self-review only', fable='pending', user='pending'),
)
json.dump(man, open(f'{D}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('MANIFEST', man['files']['final_draco'], man['triangles'], man['dimensions']['idle_envelope']['glb_xyz'])
