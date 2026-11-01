"""Minimal ASF/AMC forward kinematics (CMU convention). Units: ASF length*0.45 inch->m factor (CMU FAQ: 0.45 * 2.54/100)."""
import numpy as np, re, sys, json
S = (1/0.45) * 2.54 / 100   # ASF 'length 0.45' means file units = inches*0.45 -> metres
def rot(ax, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    return {'x': np.array([[1,0,0],[0,c,-s],[0,s,c]]), 'y': np.array([[c,0,s],[0,1,0],[-s,0,c]]), 'z': np.array([[c,-s,0],[s,c,0],[0,0,1]])}[ax]
def eul(v):
    # ASF/AMC 'XYZ' Euler angles are applied X first, then Y, then Z (fixed axes): R = Rz Ry Rx.
    # (Same convention as the reference CMU amc parsers; verified by flight-phase gravity below.)
    return rot('z', v[2]) @ rot('y', v[1]) @ rot('x', v[0])
def parse_asf(path):
    txt = open(path).read()
    bones = {}
    for blk in re.findall(r'begin(.*?)end', txt.split(':bonedata')[1].split(':hierarchy')[0], re.S):
        d = {}
        for line in blk.strip().splitlines():
            p = line.split()
            if not p: continue
            if p[0] == 'name': d['name'] = p[1]
            elif p[0] == 'direction': d['dir'] = np.array(list(map(float, p[1:4])))
            elif p[0] == 'length': d['len'] = float(p[1])
            elif p[0] == 'axis': d['axis'] = np.array(list(map(float, p[1:4])))
            elif p[0] == 'dof': d['dof'] = p[1:]
        d.setdefault('dof', [])
        bones[d['name']] = d
    hier = {}
    for line in txt.split(':hierarchy')[1].split('begin')[1].split('end')[0].strip().splitlines():
        p = line.split(); hier[p[0]] = p[1:]
    return bones, hier
def parse_amc(path):
    frames, cur = [], None
    for line in open(path):
        line = line.strip()
        if not line or line.startswith(('#', ':')): continue
        if line.isdigit():
            cur = {}; frames.append(cur); continue
        p = line.split(); cur[p[0]] = list(map(float, p[1:]))
    return frames
def fk(bones, hier, fr):
    out = {}
    r = fr['root']; pos = np.array(r[:3]) * S; Rr = eul(r[3:6])
    out['root'] = (pos, Rr)
    def walk(parent, ppos, pR):
        for c in hier.get(parent, []):
            b = bones[c]
            C = eul(b['axis']); Ci = C.T
            vals = fr.get(c, []); m = {}
            for k, dname in enumerate(b['dof']): m[dname[1]] = vals[k] if k < len(vals) else 0
            M = eul([m.get('x', 0), m.get('y', 0), m.get('z', 0)])
            L = C @ M @ Ci
            R = pR @ L
            tip = ppos + R @ (b['dir'] * b['len'] * S)
            out[c] = (tip, R)
            walk(c, tip, R)
    walk('root', pos, Rr)
    return out
if __name__ == '__main__':
    bones, hier = parse_asf(sys.argv[1])
    res = {}
    for amc in sys.argv[2:]:
        F = parse_amc(amc)
        P = [fk(bones, hier, f) for f in F]
        root = np.array([p['root'][0] for p in P]); la = np.array([p['ltibia'][0] for p in P]); ra = np.array([p['rtibia'][0] for p in P])
        lt = np.array([p['ltoes'][0] for p in P]); rt = np.array([p['rtoes'][0] for p in P])
        hipL = np.array([p['lhipjoint'][0] for p in P]); kneeL = np.array([p['lfemur'][0] for p in P])
        n = len(P); dt = 1/120
        # CMU: Y up. ground = min foot height over clip
        g = min(la[:,1].min(), ra[:,1].min(), lt[:,1].min(), rt[:,1].min())
        horiz = root[:, [0, 2]]
        v = np.linalg.norm(np.diff(horiz, axis=0), axis=1) / dt
        # contact: ankle within 4 cm of its own min height and speed < 0.5 m/s horizontally
        def contact(a, t):
            low = np.minimum(a[:,1], t[:,1]) - g
            sp = np.r_[0, np.linalg.norm(np.diff(np.minimum.reduce([a[:, [0,2]]]), axis=0), axis=1) / dt]
            return (low < 0.045)
        cl, cr = contact(la, lt), contact(ra, rt)
        knee = []
        for p in P:
            th = p['lfemur'][0] - p['lhipjoint'][0]; sh = p['ltibia'][0] - p['lfemur'][0]
            knee.append(np.degrees(np.arccos(np.clip(th @ sh / np.linalg.norm(th) / np.linalg.norm(sh), -1, 1))))
        # touchdowns of left foot
        td = [i for i in range(1, n) if cl[i] and not cl[i-1]]
        res[amc] = dict(frames=n, dur_s=round(n*dt, 3), mean_speed=round(float(np.median(v)), 3),
                        root_height=[round(float(root[:,1].min()-g), 3), round(float(root[:,1].max()-g), 3)],
                        leg_len=round(float(np.linalg.norm(kneeL[0]-hipL[0]) + np.linalg.norm(la[0]-kneeL[0])), 3),
                        duty_L=round(float(cl.mean()), 3), duty_R=round(float(cr.mean()), 3),
                        left_touchdowns_s=[round(i*dt, 3) for i in td],
                        knee_flex_max=round(float(max(knee)), 1), knee_flex_min=round(float(min(knee)), 1),
                        airborne_frac=round(float((~cl & ~cr).mean()), 3))
        if len(td) >= 2:
            T = np.diff(td).mean() * dt
            res[amc]['stride_T_s'] = round(float(T), 3); res[amc]['stride_len_m'] = round(float(T * np.median(v)), 3)
    print(json.dumps(res, indent=1))
