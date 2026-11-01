"""Scan cached CMU takes for stop / turn / sit segments (plain python3 + numpy, MEASURED only).

Run: python3 scan_takes.py [SRC_DIR] [OUT_JSON]
  SRC_DIR  default ~/.cache/g24-cmu
  OUT_JSON default SRC_DIR/derived/scan_takes.json

For every *.amc with its subject *.asf the take is loaded in one fixed heading frame and these
per-frame signals are measured: hip-midpoint horizontal speed (0.1 s central difference, 0.1 s box
smoothing), hip height over the subject's standing hip height, and pelvis yaw from the hip lateral
vector (unwrapped). Detected events (thresholds are search heuristics, not quality gates):
  stop       speed falls from >= 2.0 m/s to <= 0.25 m/s within 1.6 s
  turn_place |yaw change| >= 60 deg within 1.5 s while speed <= 0.6 m/s
  turn_move  |yaw change| >= 60 deg within 1.0 s while speed >= 1.5 m/s
  sit        hip height <= 0.72 x standing for >= 0.4 s while speed <= 0.3 m/s
The labels on the CMU search pages are not trusted on their own; this file is what the clip choice
cites. Data from mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).
"""
import glob, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu_motion import load


def box(y, n):
    n = max(1, int(n))
    return np.convolve(y, np.ones(n) / n, mode='same')


def runs(mask, min_len):
    out, st = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and st is None: st = i
        if not m and st is not None:
            if i - st >= min_len: out.append((st, i))
            st = None
    return out


def scan(src, asf, amc, fps):
    D = load(src, asf, amc, fps, 'hips')
    n = D['n']; mid = D['hipmid']
    k = max(1, int(0.05 * fps))
    v = np.zeros(n)
    for i in range(n):
        a, b = max(0, i - k), min(n - 1, i + k)
        v[i] = np.hypot(*(mid[b, :2] - mid[a, :2])) / max(1e-6, (b - a) / fps)
    v = box(v, 0.1 * fps)
    lat = D['pos']['lhipjoint'] - D['pos']['rhipjoint']
    yaw = np.unwrap(np.arctan2(-lat[:, 0], lat[:, 1]))      # forward = lateral rotated -90 deg about +Z
    hz = mid[:, 2]
    stand = float(np.percentile(hz, 90))
    ev = []
    w = int(1.6 * fps)
    i = 0
    while i < n:
        if v[i] >= 2.0:
            j = next((j for j in range(i, min(n, i + w)) if v[j] <= 0.25), None)
            if j is not None:
                a = max(0, i - int(0.6 * fps))
                ev.append(dict(kind='stop', start=int(a), end=int(min(n - 1, j + int(0.8 * fps))), v_from=round(float(v[i]), 2),
                               t_decel_s=round((j - i) / fps, 3), dist_decel_m=round(float(np.hypot(*(mid[j, :2] - mid[i, :2]))), 3)))
                i = j + int(0.8 * fps); continue
        i += 1
    for kind, win, cond in (('turn_place', 1.5, lambda s: s <= 0.6), ('turn_move', 1.0, lambda s: s >= 1.5)):
        W = int(win * fps); i = 0
        while i + 1 < n:
            j = min(n - 1, i + W)
            seg = range(i, j + 1)
            if all(cond(v[x]) for x in seg[::max(1, int(0.05 * fps))]):
                d = yaw[j] - yaw[i]
                if abs(d) >= np.radians(60):
                    # tighten to where 5 % / 95 % of the change happens
                    c = yaw[i:j + 1] - yaw[i]
                    a = i + int(np.argmax(np.abs(c) >= 0.05 * abs(d))); b = i + int(np.argmax(np.abs(c) >= 0.95 * abs(d)))
                    ev.append(dict(kind=kind, start=int(a), end=int(b), yaw_deg=round(float(np.degrees(yaw[b] - yaw[a])), 1),
                                   dur_s=round((b - a) / fps, 3), speed_mean=round(float(v[a:b + 1].mean()), 2),
                                   root_travel_m=round(float(np.hypot(*(mid[b, :2] - mid[a, :2]))), 3)))
                    i = j; continue
            i += max(1, int(0.1 * fps))
    for a, b in runs((hz <= 0.72 * stand) & (v <= 0.3), int(0.4 * fps)):
        ev.append(dict(kind='sit', start=int(a), end=int(b), dur_s=round((b - a) / fps, 3),
                       hip_ratio_min=round(float(hz[a:b].min() / stand), 3)))
    return dict(take=amc, asf=asf, fps=fps, frames=n, dur_s=round(n / fps, 2), leg_m=round(D['leg'], 4),
                stand_hip_m=round(stand, 4), speed_max=round(float(v.max()), 2),
                yaw_total_deg=round(float(np.degrees(yaw[-1] - yaw[0])), 1), events=ev)


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.cache/g24-cmu')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, 'derived', 'scan_takes.json')
    res = []
    for amc in sorted(glob.glob(os.path.join(src, '*.amc'))):
        name = os.path.basename(amc); subj = name.split('_')[0]
        fps = 60 if subj == '75' else 120          # subject 75 is captured at 60 fps (CMU file index)
        try:
            r = scan(src, f'{subj}.asf', name, fps)
        except Exception as e:                      # keep scanning; report the failure
            r = dict(take=name, error=repr(e))
        res.append(r)
        evs = ', '.join(f"{e['kind']}@{e['start'] / fps:.2f}s" + (f"({e.get('yaw_deg', '')})" if 'yaw_deg' in e else '') for e in r.get('events', []))
        print(name, r.get('dur_s'), 'vmax', r.get('speed_max'), 'yaw', r.get('yaw_total_deg'), '|', evs or r.get('error', '-'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w'), indent=1)
    print('WROTE', out)
