"""Prepare the G24 v3d extra one-shots (plain python3 + numpy; MEASURED data only).

Run: python3 prepare_extra.py [OUT_JSON]   (default ~/.cache/g24-extra/g24_extra_motion.json, not committed)
Inputs (raw files are never committed):
  ~/.cache/g24-cmu2  CMU 143_18 (sit down / get up, chair), 69_16 / 69_18 (turn in place L / R); 143.asf from
                     ~/.cache/g24-cmu, 69.asf here. CMU: mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).
  ~/.cache/g24-100style  Neutral_ID.bvh (100STYLE, Ian Mason, CC BY 4.0: "The 100STYLE Dataset - Ian Mason").
Output: the same 'oneshots' layout prepare_clips.py writes (rot/pos per segment, hip, rest_dir, events), so
mocap_retarget.make_oneshot_clips can consume it. Windows are chosen from measured signals (printed), not labels.
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu_motion import SEGS, M0, load, mat2quat
from asf_amc import parse_asf
from bvh_motion import load_bvh

C1 = os.path.expanduser('~/.cache/g24-cmu'); C2 = os.path.expanduser('~/.cache/g24-cmu2'); S = os.path.expanduser('~/.cache/g24-100style')


def pack(D, a, b, events, rest):
    mid = D['hipmid']; leg = D['leg']
    return dict(take=D['take'], fps=D['fps'], leg_m=leg, ankle_stand=D['ankle_stand'] / leg, rest_dir=rest,
                events={k: v - a for k, v in events.items()}, frames=b - a,
                rot={k: np.round(np.array([mat2quat(R) for R in D['rot'][k][a:b]]), 6).tolist() for k in SEGS},
                pos={k: np.round((D['pos'][k][a:b] - mid[a:b] * np.array([1, 1, 0])) / leg, 5).tolist() for k in SEGS},
                hip=np.round((mid[a:b] - mid[a] * np.array([1, 1, 0])) / leg, 5).tolist())


def cmu_rest(path):
    b, _ = parse_asf(path)
    return {k: (M0 @ b[k]['dir']).tolist() for k in SEGS if k in b}


def smooth_speed(mid, fps):
    k = max(1, int(0.05 * fps)); n = len(mid); v = np.zeros(n)
    for i in range(n):
        a, b = max(0, i - k), min(n - 1, i + k)
        v[i] = np.hypot(*(mid[b, :2] - mid[a, :2])) / max(1e-6, (b - a) / fps)
    return v


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/g24-extra/g24_extra_motion.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    R = dict(source='CMU mocap (143_18, 69_16, 69_18) + 100STYLE Neutral_ID (CC BY 4.0)', oneshots={})
    # ---- sit down / sitting / get up: CMU 143_18 first cycle. Events from the hip height: 'down0' last
    # frame above 97 % standing, 'seat' first frame within 2 cm of the seated minimum, 'up0' last seated
    # frame before the rise, 'stand' first frame back above 97 %.
    D = load(C2, os.path.join(C1, '143.asf'), '143_18.amc', 120, 'hips'); fps = 120
    hz = D['hipmid'][:, 2]; stand = float(np.percentile(hz[:60], 50)); low = float(hz[:400].min())
    down0 = int(np.argmax(hz < 0.97 * stand)); seat = down0 + int(np.argmax(hz[down0:] < low + 0.02))
    up0 = seat + int(np.argmax(hz[seat:] > low + 0.02)); st = up0 + int(np.argmax(hz[up0:] > 0.97 * stand))
    a, b = max(0, down0 - 12), min(D['n'], st + 24)
    ev = dict(down0=down0, seat=seat, up0=up0, stand=st)
    R['oneshots']['sit'] = pack(D, a, b, ev, cmu_rest(os.path.join(C1, '143.asf')))
    print('sit 143_18 frames', a, b, {k: round(v / fps, 3) for k, v in ev.items()}, 'stand hip', round(stand, 3), 'seated', round(low, 3))
    # ---- turn in place: one ~80-85 deg turn of 69_16 (left) and 69_18 (right) (scan_takes windows)
    for name, amc, (ta, tb) in (('turnL', '69_16.amc', (206, 345)), ('turnR', '69_18.amc', (247, 399))):
        D = load(C2, os.path.join(C2, '69.asf'), amc, 120, 'hips')
        lat = D['pos']['lhipjoint'] - D['pos']['rhipjoint']; yaw = np.unwrap(np.arctan2(-lat[:, 0], lat[:, 1]))
        a, b = max(0, ta - 18), min(D['n'], tb + 18)
        # re-heading: the take's frame-a pelvis faces +X (the turn then rotates away from it)
        c, s_ = np.cos(-yaw[a]), np.sin(-yaw[a]); Hz = np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.0]])
        for k in SEGS:
            D['pos'][k] = D['pos'][k] @ Hz.T; D['rot'][k] = np.einsum('ij,njk->nik', Hz, D['rot'][k])
        D['hipmid'] = D['hipmid'] @ Hz.T
        # Yaw stripped per frame (about the vertical through the hip midpoint): the clip keeps the stepping, leg
        # and torso motion in a heading-fixed frame; the measured yaw curve is exported so the runtime turns the
        # body by the player's actual turn angle along the same timing (the source turns 89-99 deg).
        lat = D['pos']['lhipjoint'] - D['pos']['rhipjoint']; yw = np.unwrap(np.arctan2(-lat[:, 0], lat[:, 1]))
        yw = np.convolve(np.pad(yw, 6, mode='edge'), np.ones(13) / 13, mode='valid')
        for i in range(D['n']):
            c, s_ = np.cos(-(yw[i] - yw[a])), np.sin(-(yw[i] - yw[a])); Ri = np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.0]])
            m = D['hipmid'][i] * np.array([1, 1, 0])
            for k in SEGS:
                D['pos'][k][i] = (D['pos'][k][i] - m) @ Ri.T + m; D['rot'][k][i] = Ri @ D['rot'][k][i]
        ev = dict(turn0=ta, turn1=tb)
        R['oneshots'][name] = pack(D, a, b, ev, cmu_rest(os.path.join(C2, '69.asf')))
        R['oneshots'][name]['yaw'] = np.round(yw[a:b] - yw[a], 5).tolist()
        R['oneshots'][name]['yaw_deg'] = float(np.degrees(yaw[b - 1] - yaw[a]))
        print(name, amc, 'frames', a, b, 'yaw', round(np.degrees(yaw[b - 1] - yaw[a]), 1), 'dur', round((b - a) / 120, 3))
    # ---- idle look-around: 100STYLE Neutral_ID 9.6-12.6 s (measured head yaw -67 -> -82 -> -68 deg vs pelvis
    # -67 deg: a ~14 deg glance and back, feet still). Heading from the hips at the window start.
    fb = 60
    D = load_bvh(os.path.join(S, 'Neutral_ID.bvh'), int(9.6 * fb), int(12.6 * fb), 'hips')
    rest = D['rest_dir']
    R['oneshots']['idlelook'] = pack(D, 0, D['n'], dict(start=0), rest)
    print('idlelook Neutral_ID frames', D['n'], 'fps', round(D['fps'], 3), 'leg', round(D['leg'], 3))
    json.dump(R, open(out, 'w'))
    print('WROTE', out, os.path.getsize(out))
