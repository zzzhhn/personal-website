"""100STYLE BVH -> the same per-segment layout cmu_motion.load() returns (numpy only, MEASURED data).

100STYLE (Mason, Starke, Komura 2022; Zenodo 8127870; CC BY 4.0, credit "The 100STYLE Dataset - Ian
Mason"): Xsens, 60 fps, 28-bone skeleton, centimetres, Y up, subject faces +Z with left = +X (checked
on the OFFSETs: LeftHip +X, toes +Z). That is the CMU world convention, so cmu_motion.M0 maps it to G24
(+X forward, +Y left, +Z up) unchanged. Channel order "Yrotation Xrotation Zrotation" composes as
R = Ry Rx Rz (BVH: rotations multiply in listed order, column vectors).

Segment mapping (CMU name <- BVH joint whose bone it is; the CMU 'segment' of a joint J is the bone
from J to its child, so its rotation is J's world rotation and its 'position' is the child joint):
  root<-Hips  lowerback<-Chest  upperback<-Chest2  thorax<-Chest4  lowerneck<-Neck  upperneck<-Neck
  head<-Head  [lr]clavicle<-*Collar  [lr]humerus<-*Shoulder  [lr]radius<-*Elbow
  [lr]hipjoint<-Hips (tip = *Hip joint)  [lr]femur<-*Hip  [lr]tibia<-*Knee  [lr]foot<-*Ankle  [lr]toes<-*Toe
"""
import numpy as np
from cmu_motion import M0, SEGS

UNIT = 0.01      # centimetres -> metres


def _R(axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    if axis == 'X': return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'Y': return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def parse(path):
    lines = open(path).read().split('\n')
    joints, stack, order = {}, [], []
    i = 0
    while not lines[i].strip().startswith('MOTION'):
        t = lines[i].split()
        if t and t[0] in ('ROOT', 'JOINT'):
            name = t[1]; joints[name] = dict(parent=stack[-1] if stack else None, children=[], end=None)
            if stack: joints[stack[-1]]['children'].append(name)
            order.append(name); cur = name
        elif t and t[0] == 'End':
            cur = ('END', stack[-1])
        elif t and t[0] == '{':
            stack.append(cur if not isinstance(cur, tuple) else '__end__')
        elif t and t[0] == '}':
            stack.pop()
        elif t and t[0] == 'OFFSET':
            off = np.array(list(map(float, t[1:4]))) * UNIT
            if isinstance(cur, tuple): joints[cur[1]]['end'] = off
            else: joints[cur]['offset'] = off
        elif t and t[0] == 'CHANNELS':
            joints[cur]['channels'] = t[2:]
        i += 1
    n = int(lines[i + 1].split()[1]); ft = float(lines[i + 2].split()[2])
    data = np.array([list(map(float, l.split())) for l in lines[i + 3:i + 3 + n]])
    return joints, order, data, 1.0 / ft


def fk(joints, order, data):
    """World rotation (n,3,3) and joint position (n,3) per joint, BVH frame, metres."""
    n = len(data); col = 0; R, P = {}, {}
    for name in order:
        j = joints[name]; ch = j['channels']; vals = data[:, col:col + len(ch)]; col += len(ch)
        L = np.repeat(np.eye(3)[None], n, 0); t = np.zeros((n, 3))
        for k, c in enumerate(ch):
            if c.endswith('position'): t[:, 'XYZ'.index(c[0])] = vals[:, k] * UNIT
            else:
                L = np.einsum('nij,njk->nik', L, np.array([_R(c[0], v) for v in vals[:, k]]))
        if j['parent'] is None:
            P[name] = j['offset'][None] + t; R[name] = L
        else:
            pr = R[j['parent']]
            P[name] = P[j['parent']] + np.einsum('nij,j->ni', pr, j['offset']); R[name] = np.einsum('nij,njk->nik', pr, L)
    return R, P


MAP = {'root': 'Hips', 'lowerback': 'Chest', 'upperback': 'Chest2', 'thorax': 'Chest4', 'lowerneck': 'Neck',
       'upperneck': 'Neck', 'head': 'Head'}
for s, S in (('l', 'Left'), ('r', 'Right')):
    MAP.update({f'{s}clavicle': f'{S}Collar', f'{s}humerus': f'{S}Shoulder', f'{s}radius': f'{S}Elbow',
                f'{s}hipjoint': 'Hips', f'{s}femur': f'{S}Hip', f'{s}tibia': f'{S}Knee', f'{s}foot': f'{S}Ankle',
                f'{s}toes': f'{S}Toe'})
TIP = {f'{s}hipjoint': f'{S}Hip' for s, S in (('l', 'Left'), ('r', 'Right'))}


def load_bvh(path, a=0, b=None, heading='hips'):
    """Frames [a, b) of a 100STYLE BVH in the cmu_motion.load() layout (G24 axes, ground at z = 0)."""
    joints, order, data, fps = parse(path)
    data = data[a:b]
    R, P = fk(joints, order, data)
    n = len(data)

    def tip(seg):
        J = TIP.get(seg) or MAP[seg]
        if seg in TIP: return P[J]
        j = joints[J]
        if j['children']:
            c = j['children'][0] if J != 'Hips' else None
            if J == 'Chest4': c = 'Neck'
            if J == 'Hips': return P['Hips']
            return P[c]
        return P[J] + np.einsum('nij,j->ni', R[J], j['end'])
    pos = {k: tip(k) for k in SEGS}
    rot = {k: R[MAP[k]] for k in SEGS}
    rest = {}
    for k in SEGS:
        J = MAP[k]; j = joints[J]
        if k in TIP: d = joints[TIP[k]]['offset']
        elif k == 'root': d = np.array([0, 1.0, 0])
        elif J == 'Chest4': d = joints['Neck']['offset']
        elif j['children']: d = joints[j['children'][0]]['offset']
        else: d = j['end']
        rest[k] = (M0 @ (d / max(1e-9, np.linalg.norm(d)))).tolist()
    leg = float(np.linalg.norm(joints['LeftKnee']['offset']) + np.linalg.norm(joints['LeftAnkle']['offset']))
    if heading == 'velocity':
        f = pos['root'][-1, [0, 2]] - pos['root'][0, [0, 2]]
    else:
        lat = (pos['lhipjoint'][:30] - pos['rhipjoint'][:30]).mean(0)
        fw = np.cross(lat, [0, 1.0, 0]); f = fw[[0, 2]]
    ang = np.arctan2(f[0], f[1]); c, s_ = np.cos(-ang), np.sin(-ang)
    H = np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
    B = M0 @ H
    low = np.minimum.reduce([pos[k][:, 1] for k in ('ltibia', 'rtibia', 'lfoot', 'rfoot', 'ltoes', 'rtoes')])
    ground = float(np.percentile(low, 1))
    out = dict(n=n, fps=fps, leg=leg, take=path.split('/')[-1], heading=heading, pos={}, rot={}, rest_dir=rest)
    for k in SEGS:
        p = pos[k].copy(); p[:, 1] -= ground
        out['pos'][k] = p @ B.T
        out['rot'][k] = np.einsum('ij,njk,lk->nil', B, rot[k], M0)
    mid = (out['pos']['lhipjoint'] + out['pos']['rhipjoint']) / 2
    out['hipmid'] = mid
    t = np.arange(n) / fps
    out['speed'] = float((mid[-1, 0] - mid[0, 0]) / t[-1]) if heading == 'velocity' and n > 1 else 0.0
    stand = [np.percentile(out['pos'][f'{s}tibia'][:, 2], 10) for s in 'lr']
    out['ankle_stand'] = float(np.mean(stand))
    out['h'] = leg + out['ankle_stand']
    return out
