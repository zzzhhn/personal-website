"""Prepare measured CMU motion for G24 (plain python3 + numpy).

Run: python3 prepare_clips.py [SRC_DIR] [OUT_JSON]
  SRC_DIR  default ~/.cache/g24-cmu (fill it with fetch_cmu.sh; raw CMU files are not committed)
  OUT_JSON default ~/.cache/g24-cmu/derived/g24_cmu_motion.json (intermediate, not committed)

Output = MEASURED quantities only, in G24 axes (+X fwd, +Y left, +Z up):
  * loops (walk/run/sprint): one averaged, loop-closed cycle of N samples, phase 0 = left-ankle
    forward maximum; per segment world rotation deltas from the ASF rest pose (quaternion w,x,y,z),
    joint positions relative to the hip midpoint divided by the subject leg length (femur+tibia),
    hip height, surge and sway (same unit), source cycle time, speed, leg length, standing ankle
    height; and segment rest directions (G24 axes) for rest-offset retargeting.
  * one-shots (jump, run jump, landing): frame sequences cropped around detected events.
All retarget choices are made in build_guide.py and recorded there.
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu_motion import SEGS, M0, gait_cycle, event_take, mat2quat
from asf_amc import parse_asf

LOOPS = {
    'walk': [('35.asf', '35_01.amc', 120), ('35.asf', '35_02.amc', 120), ('35.asf', '35_03.amc', 120)],
    # run: subject 09 (10 takes, 3.4-3.6 m/s, measured trunk lean 12-18 deg). Subject 127 runs at
    # 4.3-4.6 m/s but with a 29-35 deg forward lean that reads as a stumble on the big-head G24.
    'run': [('09.asf', f'09_{i:02d}.amc', 120) for i in (1, 2, 3, 4, 5, 6, 7, 8, 9, 11)],
    'sprint': [('143.asf', '143_01.amc', 120), ('141.asf', '141_01.amc', 120)],
}
ONESHOTS = {
    'jump': ('16.asf', '16_01.amc', 120, 'hips'),
    'jump_b': ('16.asf', '16_02.amc', 120, 'hips'),
    'runjump': ('75.asf', '75_03.amc', 60, 'velocity'),
    'runjump_b': ('75.asf', '75_02.amc', 60, 'velocity'),
}


def rest_dirs(src, asf):
    b, _ = parse_asf(os.path.join(src, asf))
    return {k: (M0 @ b[k]['dir']).tolist() for k in SEGS if k in b}


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/g24-cmu')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, 'derived', 'g24_cmu_motion.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    R = dict(source='CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with funding from NSF EIA-0196217)',
             axes='G24: +X forward, +Y left, +Z up; lengths in source leg-length units unless *_m', loops={}, oneshots={})
    for name, takes in LOOPS.items():
        avg, st = gait_cycle(src, takes)
        R['loops'][name] = dict(stats=st, rest_dir=rest_dirs(src, takes[0][0]),
                                rot={k: np.round(v, 6).tolist() for k, v in avg['rot'].items()},
                                pos={k: np.round(v, 5).tolist() for k, v in avg['pos'].items()},
                                hip_z=np.round(avg['hip_z'], 5).tolist(), surge=np.round(avg['surge'], 5).tolist(),
                                sway=np.round(avg['sway'], 5).tolist(), ankle_stand=avg['ankle_stand'])
        print(name, 'cycles', st['n_cycles'], 'T', round(st['T_src_s'], 3), 'v', round(st['speed_src'], 2), 'leg', round(st['leg_src'], 3))
    for name, (asf, amc, fps, hd) in ONESHOTS.items():
        D = event_take(src, asf, amc, fps, hd)
        e = D['events']
        a = max(0, e['crouch'] - int(0.15 * fps)); b = min(D['n'], e['absorb'] + int(0.45 * fps))
        leg = D['leg']; mid = D['hipmid']
        R['oneshots'][name] = dict(take=amc, fps=fps, leg_m=leg, ankle_stand=D['ankle_stand'] / leg, rest_dir=rest_dirs(src, asf),
                                   events={k: (v - a if isinstance(v, int) else v) for k, v in e.items()}, frames=b - a,
                                   rot={k: np.round(np.array([mat2quat(Rm) for Rm in D['rot'][k][a:b]]), 6).tolist() for k in SEGS},
                                   pos={k: np.round((D['pos'][k][a:b] - mid[a:b] * np.array([1, 1, 0])) / leg, 5).tolist() for k in SEGS},
                                   hip=np.round((mid[a:b] - mid[a] * np.array([1, 1, 0])) / leg, 5).tolist())
        print(name, amc, 'frames', b - a, 'events', R['oneshots'][name]['events'])
    json.dump(R, open(out, 'w'))
    print('WROTE', out, os.path.getsize(out))
