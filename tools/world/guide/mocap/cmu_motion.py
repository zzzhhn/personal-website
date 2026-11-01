"""CMU ASF/AMC -> heading-normalised segment rotations and joint positions in G24 axes (numpy only).

MEASURED data only. G24-specific choices (scales, clamps, contact baking) live in build_guide.py.

Axes of every output: Blender/G24 convention, +X forward, +Y character left, +Z up, metres.
CMU convention (verified on subject 35/09): Y up, left = +X when the subject faces +Z; ASF/AMC
Euler 'XYZ' = R = Rz Ry Rx; units (1/0.45) * 2.54/100 m per ASF unit (CMU FAQ).
A segment rotation D is the world delta from the ASF rest pose (rest: subject upright, facing
forward, arms in T), so D = B R_cmu M0^T with B the heading map of the take.
The data is from mocap.cs.cmu.edu (created with funding from NSF EIA-0196217).
"""
import os
import numpy as np
from asf_amc import parse_asf, parse_amc, fk

SEGS = ['root', 'lowerback', 'upperback', 'thorax', 'lowerneck', 'upperneck', 'head',
        'lclavicle', 'lhumerus', 'lradius', 'rclavicle', 'rhumerus', 'rradius',
        'lhipjoint', 'lfemur', 'ltibia', 'lfoot', 'ltoes', 'rhipjoint', 'rfemur', 'rtibia', 'rfoot', 'rtoes']
SIDED = {'lclavicle', 'lhumerus', 'lradius', 'lhipjoint', 'lfemur', 'ltibia', 'lfoot', 'ltoes',
         'rclavicle', 'rhumerus', 'rradius', 'rhipjoint', 'rfemur', 'rtibia', 'rfoot', 'rtoes'}
M0 = np.array([[0, 0, 1.0], [1.0, 0, 0], [0, 1.0, 0]])     # CMU (x left, y up, z fwd) -> G24 (fwd, left, up)
SY = np.diag([1.0, -1.0, 1.0])


def swap(name):
    if name in SIDED:
        return ('r' if name[0] == 'l' else 'l') + name[1:]
    return name


# ---------------------------------------------------------------- quaternions (w, x, y, z)
def mat2quat(R):
    m = R; t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2; w = 0.25 * s
        x = (m[2, 1] - m[1, 2]) / s; y = (m[0, 2] - m[2, 0]) / s; z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; w = (m[2, 1] - m[1, 2]) / s
        x = 0.25 * s; y = (m[0, 1] + m[1, 0]) / s; z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; w = (m[0, 2] - m[2, 0]) / s
        x = (m[0, 1] + m[1, 0]) / s; y = 0.25 * s; z = (m[1, 2] + m[2, 1]) / s
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; w = (m[1, 0] - m[0, 1]) / s
        x = (m[0, 2] + m[2, 0]) / s; y = (m[1, 2] + m[2, 1]) / s; z = 0.25 * s
    q = np.array([w, x, y, z]); return q / np.linalg.norm(q)


def qmul(a, b):
    w1, x1, y1, z1 = a; w2, x2, y2, z2 = b
    return np.array([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2])


def qinv(q):
    return np.array([q[0], -q[1], -q[2], -q[3]])


def slerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0: b = -b; d = -d
    if d > 0.9995:
        q = a + t * (b - a); return q / np.linalg.norm(q)
    th = np.arccos(min(1.0, d)); s = np.sin(th)
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / s


def qmean(qs):
    ref = qs[0]; acc = np.zeros(4)
    for q in qs:
        acc += q if np.dot(q, ref) >= 0 else -q
    return acc / np.linalg.norm(acc)


# ---------------------------------------------------------------- takes
def load(src, asf, amc, fps=120.0, heading=None):
    """Per-frame data of one take in G24 axes. heading: 'velocity' (locomotion) or 'hips'."""
    b, h = parse_asf(os.path.join(src, asf))
    F = parse_amc(os.path.join(src, amc))
    P = [fk(b, h, f) for f in F]
    n = len(F)
    pos = {k: np.array([p[k][0] for p in P]) for k in SEGS}
    rot = {k: np.array([p[k][1] for p in P]) for k in SEGS}
    leg = float(b['lfemur']['len'] + b['ltibia']['len']) * (1 / 0.45) * 2.54 / 100
    if heading is None:
        d = pos['root'][-1, [0, 2]] - pos['root'][0, [0, 2]]
        heading = 'velocity' if np.linalg.norm(d) / max(1e-6, (n - 1) / fps) > 0.5 else 'hips'
    if heading == 'velocity':
        f = pos['root'][-1, [0, 2]] - pos['root'][0, [0, 2]]
    else:
        lat = (pos['lhipjoint'][:30] - pos['rhipjoint'][:30]).mean(0)
        fw = np.cross(lat, [0, 1.0, 0]); f = fw[[0, 2]]
    a = np.arctan2(f[0], f[1])
    c, s_ = np.cos(-a), np.sin(-a)
    H = np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
    B = M0 @ H
    low = np.minimum.reduce([pos[k][:, 1] for k in ('ltibia', 'rtibia', 'lfoot', 'rfoot', 'ltoes', 'rtoes')])
    ground = float(np.percentile(low, 1))
    out = dict(n=n, fps=fps, leg=leg, take=amc, heading=heading, pos={}, rot={})
    for k in SEGS:
        p = pos[k].copy(); p[:, 1] -= ground
        out['pos'][k] = p @ B.T
        out['rot'][k] = np.einsum('ij,njk,lk->nil', B, rot[k], M0)
    mid = (out['pos']['lhipjoint'] + out['pos']['rhipjoint']) / 2
    out['hipmid'] = mid
    t = np.arange(n) / fps
    out['speed'] = float((mid[-1, 0] - mid[0, 0]) / t[-1]) if heading == 'velocity' else 0.0
    stand = []
    for side in 'lr':
        a_ = out['pos'][f'{side}tibia'][:, 2]
        stand.append(np.percentile(a_, 10))
    out['ankle_stand'] = float(np.mean(stand))
    out['h'] = leg + out['ankle_stand']       # hip-to-ground height of this subject (measured)
    return out


def mirror(D):
    """Mirror a take dict across the sagittal plane (swap sides, negate +Y)."""
    M = dict(D); M['pos'] = {}; M['rot'] = {}
    for k in SEGS:
        M['pos'][swap(k)] = D['pos'][k] @ SY
        M['rot'][swap(k)] = np.einsum('ij,njk,kl->nil', SY, D['rot'][k], SY)
    M['hipmid'] = D['hipmid'] @ SY
    return M


def maxima(y, gap):
    ys = np.convolve(y, np.ones(5) / 5, mode='same')
    idx = [i for i in range(3, len(ys) - 3) if ys[i] == ys[i - 3:i + 4].max()]
    out = []
    for i in idx:
        if not out or i - out[-1] >= gap:
            out.append(i)
    return out


def resample_cycle(D, a, b, N):
    """N+1 samples from frame a to frame b (inclusive) of positions (hip-mid relative in x/y) and rotations."""
    u = np.linspace(0, 1, N + 1)
    x = a + u * (b - a)
    i0 = np.floor(x).astype(int); fr = x - i0; i1 = np.minimum(i0 + 1, D['n'] - 1)
    mid = D['hipmid']
    pos = {}
    for k in SEGS:
        rel = D['pos'][k] - mid * np.array([1, 1, 0])
        pos[k] = rel[i0] * (1 - fr)[:, None] + rel[i1] * fr[:, None]
    rot = {}
    for k in SEGS:
        Q = np.array([mat2quat(R) for R in D['rot'][k]])
        rot[k] = np.array([slerp(Q[i], Q[j], f) for i, j, f in zip(i0, i1, fr)])
    t = np.arange(D['n']) / D['fps']
    surge = mid[:, 0] - D['speed'] * t
    sway = mid[:, 1] - np.polyval(np.polyfit(t, mid[:, 1], 1), t)
    lin = lambda arr: arr[i0] * (1 - fr) + arr[i1] * fr
    return dict(pos=pos, rot=rot, hip_z=lin(mid[:, 2]), surge=lin(surge) - lin(surge).mean(), sway=lin(sway),
                T=(b - a) / D['fps'])


def gait_cycle(src, takes, N=120):
    """Average loop cycle (phase 0 = left-ankle forward maximum) over takes and their mirrors.
    Positions are divided by each subject's hip-to-ankle leg length (ASF femur + tibia); the
    measured standing ankle height (ankle_stand/leg) is returned so a consumer can rebase heights."""
    cycles, info = [], []
    for asf, amc, fps in takes:
        D = load(src, asf, amc, fps, 'velocity')
        h = D['h']
        rel = {s: D['pos'][f'{s}tibia'][:, 0] - D['hipmid'][:, 0] for s in 'lr'}
        gaps = []
        for s in 'lr':
            pk = maxima(rel[s], int(0.25 * fps)); gaps += np.diff(pk).tolist()
        per = float(np.median(gaps))
        used = []
        for side, DD in (('l', D), ('r', mirror(D))):
            pk = maxima(rel[side], int(0.7 * per))
            for a, b in zip(pk, pk[1:]):
                if 0.8 * per <= b - a <= 1.25 * per and b < D['n']:
                    c = resample_cycle(DD, a, b, N)
                    c['h'] = h; c['speed'] = D['speed']; c['leg'] = D['leg']; c['ankle_stand'] = D['ankle_stand']
                    cycles.append(c); used.append([side, int(a), int(b)])
        info.append(dict(take=amc, fps=fps, h_m=round(h, 4), leg_m=round(D['leg'], 4), ankle_stand_m=round(D['ankle_stand'], 4),
                         speed_mps=round(D['speed'], 3), period_s=round(per / fps, 4), cycles=used))
    # normalise and average
    avg = dict(pos={}, rot={})
    for k in SEGS:
        avg['pos'][k] = np.mean([c['pos'][k] / c['leg'] for c in cycles], axis=0)
        Q = np.array([c['rot'][k] for c in cycles])           # (C, N+1, 4)
        avg['rot'][k] = np.array([qmean(Q[:, i]) for i in range(N + 1)])
    for k in ('hip_z', 'surge', 'sway'):
        avg[k] = np.mean([c[k] / c['leg'] for c in cycles], axis=0)
    # loop closure: distribute the end-start residual linearly over the cycle
    w = np.linspace(0, 1, N + 1)
    for k in SEGS:
        res = avg['pos'][k][-1] - avg['pos'][k][0]
        avg['pos'][k] = (avg['pos'][k] - np.outer(w, res))[:N]
        q0, q1 = avg['rot'][k][0], avg['rot'][k][-1]
        r = qmul(q1, qinv(q0))
        I = np.array([1.0, 0, 0, 0])
        avg['rot'][k] = np.array([qmul(slerp(I, qinv(r), w[i]), avg['rot'][k][i]) for i in range(N)])
    for k in ('hip_z', 'surge', 'sway'):
        res = avg[k][-1] - avg[k][0]; avg[k] = (avg[k] - w * res)[:N]
    avg['ankle_stand'] = float(np.mean([c['ankle_stand'] / c['leg'] for c in cycles]))
    stats = dict(n_cycles=len(cycles), takes=info,
                 T_src_s=float(np.mean([c['T'] for c in cycles])), T_src_std=float(np.std([c['T'] for c in cycles])),
                 speed_src=float(np.mean([c['speed'] for c in cycles])), h_src=float(np.mean([c['h'] for c in cycles])),
                 leg_src=float(np.mean([c['leg'] for c in cycles])),
                 stride_over_leg=float(np.mean([c['speed'] * c['T'] / c['leg'] for c in cycles])),
                 T_over_sqrt_leg=float(np.mean([c['T'] / np.sqrt(c['leg']) for c in cycles])),
                 ankle_stand_over_leg=avg['ankle_stand'])
    return avg, stats


def event_take(src, asf, amc, fps=120.0, heading='hips'):
    """Whole take for one-shot motions (jumps). Positions divided by h; events detected from feet."""
    D = load(src, asf, amc, fps, heading)
    h = D['h']
    lowL = np.minimum.reduce([D['pos'][k][:, 2] for k in ('ltibia', 'lfoot', 'ltoes')])
    lowR = np.minimum.reduce([D['pos'][k][:, 2] for k in ('rtibia', 'rfoot', 'rtoes')])
    air = (lowL > 0.06) & (lowR > 0.06)
    runs, st = [], None
    for i, a in enumerate(list(air) + [False]):
        if a and st is None: st = i
        if not a and st is not None:
            if i - st >= int(0.12 * fps): runs.append((st, i))
            st = None
    to, td = max(runs, key=lambda r: r[1] - r[0]) if runs else (None, None)
    hz = D['hipmid'][:, 2]
    ev = dict(takeoff=to, touchdown=td)
    if to is not None:
        pre = range(max(0, to - int(0.8 * fps)), to)
        ev['crouch'] = int(min(pre, key=lambda i: hz[i]))
        ev['apex'] = int(max(range(to, td), key=lambda i: hz[i]))
        post = range(td, min(D['n'], td + int(0.8 * fps)))
        ev['absorb'] = int(min(post, key=lambda i: hz[i]))
        tt = np.arange(to + 2, td - 2) / fps
        if len(tt) > 6:
            ev['flight_gravity_mps2'] = float(2 * np.polyfit(tt, hz[to + 2:td - 2], 2)[0])
    D['events'] = ev
    D['lowL'], D['lowR'] = lowL, lowR
    return D
