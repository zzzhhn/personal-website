"""G24 retarget of measured CMU loops (imported by build_guide.py inside Blender).

Input: ~/.cache/g24-cmu/derived/g24_cmu_motion.json from mocap/prepare_clips.py (measured only).
Method (Fable v3 spec 1.2):
  * per-segment world rotation deltas D_src (from the CMU rest pose) are applied to G24 bones with
    a rest offset: D_g24 = D_src @ R_off, R_off = rotation taking the G24 rest bone direction to the
    CMU rest segment direction (so the bone points where the measured segment points);
  * spatial scale s = L_g24 / L_src (hip-to-ankle leg length), time scale sqrt(s) (Froude);
  * legs: measured ankle path (scaled, re-based to the G24 standing ankle height) solved by the
    existing analytic two-bone IK with the measured knee as pole; feet use the measured foot
    rotation; stance windows are pinned OFFLINE (contact bake): the lowest boot vertex of each
    stance frame is held fixed in virtual world space (in-place root speed added back), so heel
    strike -> flat -> toe roll keeps a real pivot; swing frames carry the correction smoothly;
  * AUTHORED choices are all in CFG below and recorded in the build report.
"""
import json, math, os
import numpy as np
from mathutils import Vector, Quaternion, Matrix

SRC = os.path.expanduser('~/.cache/g24-cmu/derived/g24_cmu_motion.json')
# AUTHORED (not measured). Every value is a G24 design choice for the TABS body.
CFG = {
    # Walk is only seen while starting/stopping (spec 1.3, <= 2.0 m/s): Froude-scaled CMU 35 walk is
    # 1.03 m/s; stride x1.25 and cadence x1.2 (authored) give ~1.55 m/s, Fr ~0.37.
    'Walk': dict(source='walk', stride_scale=1.25, cadence_scale=1.2, arm_swing_scale=2.2, arm_min_abd_deg=30.0,
                 elbow_min_deg=18.0, elbow_max_deg=45.0, head_follow=0.6, surge_scale=1.0, min_track=-0.005, swing_clear=0.03, knee_max_deg=100.0, flat_ref=True),
    # Run (default move, spec 1.3 target 3.6 m/s): Froude-scaled CMU 09 is ~2.88 m/s; stride x1.12 and
    # cadence x1.115 (authored) give 3.6 m/s.
    'Run': dict(source='run', stride_scale=1.12, cadence_scale=1.115, arm_swing_scale=1.0, arm_min_abd_deg=30.0,
                elbow_min_deg=50.0, elbow_max_deg=85.0, arm_mean_scale=0.6, head_follow=0.55, surge_scale=1.0, min_track=-0.005, swing_clear=0.05, knee_max_deg=100.0),
    # Fable v3 1.3 target 6.2 m/s; Froude-scaled CMU 143_01/141_01 gives ~5.2 m/s, so stride x1.10 and
    # cadence x1.088 (authored, recorded) bring it to the target.
    'Sprint': dict(source='sprint', stride_scale=1.10, cadence_scale=1.088, arm_swing_scale=0.9, arm_min_abd_deg=30.0,
                   elbow_min_deg=55.0, elbow_max_deg=85.0, arm_mean_scale=0.5, head_follow=0.5, surge_scale=0.6, min_track=-0.005, swing_clear=0.05, knee_max_deg=100.0),
}
# Shared AUTHORED notes: arms are rebuilt as G24 hinges (upper-arm direction = measured sagittal swing
# x scale with abduction >= min; forearm = measured elbow angle, clamped, about the G24 elbow hinge),
# because measured humerus twist and the human elbow range fold G24's short sleeve skin and swing
# the forearm through the torso (A6). Feet: lateral offset >= min_track (thick TABS legs touch at
# HIP_Y = 0.10 m); swing feet keep >= 6 mm + swing_clear * sin(pi s) above the floor.
SEG_FOR_BONE = {'spine': 'upperback', 'chest': 'thorax', 'head': 'head', 'upperarm': 'humerus', 'forearm': 'radius',
                'foot': 'foot'}


def q_of(a):
    return Quaternion((float(a[0]), float(a[1]), float(a[2]), float(a[3])))


def load():
    return json.load(open(SRC))


class Loop:
    """Periodic access to one averaged CMU cycle."""

    def __init__(self, L):
        self.L = L
        self.n = len(L['hip_z'])
        self.rot = {k: [q_of(q) for q in v] for k, v in L['rot'].items()}
        self.pos = {k: np.array(v) for k, v in L['pos'].items()}
        self.hip_z = np.array(L['hip_z']); self.surge = np.array(L['surge']); self.sway = np.array(L['sway'])
        self.rest = {k: Vector(v).normalized() for k, v in L['rest_dir'].items()}
        st = L['stats']
        self.T = st['T_src_s']; self.v = st['speed_src']; self.leg = st['leg_src']; self.ankle_stand = L['ankle_stand']

    def _ix(self, u):
        x = (u % 1.0) * self.n
        i = int(math.floor(x)); a = x - i
        return i % self.n, (i + 1) % self.n, a

    def q(self, seg, u):
        i, j, a = self._ix(u)
        return self.rot[seg][i].slerp(self.rot[seg][j], a)

    def p(self, seg, u):
        i, j, a = self._ix(u)
        return Vector(self.pos[seg][i] * (1 - a) + self.pos[seg][j] * a)

    def s(self, arr, u):
        i, j, a = self._ix(u)
        A = getattr(self, arr)
        return float(A[i] * (1 - a) + A[j] * a)


def rest_offset(g24_dir, src_dir):
    return Vector(g24_dir).normalized().rotation_difference(Vector(src_dir).normalized())


def make_loop_clip(name, data, REST, BOOT, consts, solve_pose_world, fps=60):
    """Returns (frames list of (local pose dict, contact dict)), report dict."""
    cfg = CFG[name]
    lp = Loop(data['loops'][cfg['source']])
    Lg = consts['LEG']
    s = Lg / lp.leg
    T = lp.T * math.sqrt(s) / cfg['cadence_scale']
    nfr = max(8, int(round(T * fps)))
    T = nfr / fps
    stride = lp.v * lp.T / lp.leg * Lg * cfg['stride_scale']
    v = stride / T
    ANKLE_Z, HIP_Y, HIP_Z = consts['ANKLE_Z'], consts['HIP_Y'], consts['HIP_Z']
    rest_dir = lambda b: (REST[b]['tail'] - REST[b]['head']).normalized()
    off = {}
    for side, tag in (('l', 'L'), ('r', 'R')):
        off[f'upperarm.{tag}'] = rest_offset(rest_dir(f'upperarm.{tag}'), lp.rest[f'{side}humerus'])
        off[f'forearm.{tag}'] = rest_offset(rest_dir(f'forearm.{tag}'), lp.rest[f'{side}radius'])
        off[f'foot.{tag}'] = rest_offset(rest_dir(f'foot.{tag}'), lp.rest[f'{side}foot'])
    off['spine'] = rest_offset(rest_dir('spine'), lp.rest['upperback'])
    off['chest'] = rest_offset(rest_dir('chest'), lp.rest['thorax'])
    off['head'] = rest_offset(rest_dir('head'), lp.rest['head'])
    xs = cfg['stride_scale']

    hz_mean = float(np.mean(lp.hip_z))
    l1 = (REST['thigh.L']['tail'] - REST['thigh.L']['head']).length
    l2 = (REST['shin.L']['tail'] - REST['shin.L']['head']).length
    knee_max = math.radians(cfg['knee_max_deg']) if cfg.get('knee_max_deg') else None
    hip_off = ANKLE_Z + (hz_mean - lp.ankle_stand) * Lg      # first guess; re-solved from stance below
    # AUTHORED foot re-reference: the measured foot rotation is corrected by one constant rotation per
    # side so that at the measured flat-foot frame (ankle and toe both nearest their stance minimum)
    # the G24 boot is exactly flat. The shorter, wider G24 boot otherwise stays on its heel corner for
    # the whole stance. Heel strike and toe roll are kept relative to that frame.
    mean_swing, elbow_rng = {}, {}
    for side, tag in (('l', 'L'), ('r', 'R')):
        sws, fls = [], []
        for i in range(lp.n):
            u_ = i / lp.n
            ci = (lp.q('thorax', u_) @ off['chest']).inverted()
            sh_ = lp.p(f'{side}clavicle', u_); el_ = lp.p(f'{side}humerus', u_); wr_ = lp.p(f'{side}radius', u_)
            d_ = (ci @ (el_ - sh_)).normalized()
            sws.append(math.atan2(d_.x, -d_.z)); fls.append((el_ - sh_).angle(wr_ - el_))
        mean_swing[tag] = float(np.mean(sws)) * cfg.get('arm_mean_scale', 1.0)
        elbow_rng[tag] = (float(min(fls)), float(max(fls)))
    footcorr = {'L': Quaternion(), 'R': Quaternion()}
    for side, tag in ((('l', 'L'), ('r', 'R')) if cfg.get('flat_ref') else ()):
        az = lp.pos[f'{side}tibia'][:, 2]; tz = lp.pos[f'{side}toes'][:, 2]
        i_ref = int(np.argmin((az - az.min()) + (tz - tz.min())))
        qref = lp.rot[f'{side}foot'][i_ref] @ off[f'foot.{tag}']
        fw = qref @ Vector((1, 0, 0))
        footcorr[tag] = Quaternion((0, 0, 1), math.atan2(fw.y, fw.x)) @ qref.inverted()

    def raw(u):
        D = {}
        D['pelvis'] = lp.q('root', u)
        D['spine'] = lp.q('upperback', u) @ off['spine']
        D['chest'] = lp.q('thorax', u) @ off['chest']
        hd = lp.q('head', u) @ off['head']
        D['head'] = D['chest'].slerp(hd, cfg['head_follow']) if cfg['head_follow'] < 1 else hd
        arms = {}
        cinv = D['chest'].inverted()
        for side, tag, sg in (('l', 'L', 1), ('r', 'R', -1)):
            sh = lp.p(f'{side}clavicle', u); el = lp.p(f'{side}humerus', u); wr = lp.p(f'{side}radius', u)
            dc = (cinv @ (el - sh)).normalized()
            swing = math.atan2(dc.x, -dc.z)
            abd = math.asin(max(-1.0, min(1.0, dc.y * sg)))
            # AUTHORED: swing amplitude about the clip's mean (measured mean kept), elbow follows
            # the measured flexion curve but compressed into [elbow_min, elbow_max] (G24 short sleeve)
            swing2 = mean_swing[tag] + (swing - mean_swing[tag]) * cfg['arm_swing_scale']
            abd2 = max(abd, math.radians(cfg['arm_min_abd_deg']))
            ca = math.cos(abd2)
            d2 = Vector((ca * math.sin(swing2), sg * math.sin(abd2), -ca * math.cos(swing2)))
            rd = rest_dir(f'upperarm.{tag}')
            Qu = D['chest'] @ rd.rotation_difference(d2)
            flex = (el - sh).angle(wr - el)
            lo_, hi_ = elbow_rng[tag]
            e0, e1 = math.radians(cfg.get('elbow_min_deg', 15.0)), math.radians(cfg['elbow_max_deg'])
            flex = e0 + (e1 - e0) * ((flex - lo_) / max(1e-6, hi_ - lo_)) if hi_ > lo_ else min(flex, e1)
            k = rd.cross(Vector((1, 0, 0))).normalized()
            arms[tag] = (Qu, Qu @ Quaternion(k, flex))
        D['arms'] = arms
        feet = {}
        for side, tag, sg in (('l', 'L', 1), ('r', 'R', -1)):
            a = lp.p(f'{side}tibia', u); hj = lp.p(f'{side}hipjoint', u); kn = lp.p(f'{side}femur', u)
            x = a.x * Lg * xs + lp.s('surge', u) * Lg * cfg['surge_scale']
            y = sg * HIP_Y + sg * max(sg * (a.y - hj.y) * Lg, cfg['min_track'])
            z = hip_off + (lp.s('hip_z', u) - hz_mean) * Lg + (a.z - lp.s('hip_z', u)) * Lg
            pole = (kn - hj) - ((a - hj).normalized() * (kn - hj).dot((a - hj).normalized()))
            qf = footcorr[tag] @ lp.q(f'{side}foot', u) @ off[f'foot.{tag}']
            feet[tag] = (Vector((x, y, z)), qf, pole.normalized() if pole.length > 1e-6 else Vector((1, 0, 0)))
        D['feet'] = feet
        hz = hip_off + (lp.s('hip_z', u) - hz_mean) * Lg
        D['hip'] = Vector((lp.s('surge', u) * Lg * cfg['surge_scale'], lp.s('sway', u) * Lg, hz))
        return D

    def build():
        poses = [raw(f / nfr) for f in range(nfr)]
        offs = [Vector(o) for o in BOOT['offsets']]

        def boot_pts(ank, q, tag):
            m = Vector((1, -1, 1)) if tag == 'L' else Vector((1, 1, 1))
            return [ank + q @ Vector((o.x * m.x, o.y * m.y, o.z * m.z)) for o in offs]

        dzs = []
        contact = {'L': [False] * nfr, 'R': [False] * nfr}
        pinned = {'L': [None] * nfr, 'R': [None] * nfr}
        report = dict(source=cfg['source'], src_cycle_s=lp.T, src_speed_mps=lp.v, src_leg_m=lp.leg, scale_s=s,
                      cycle_s=T, frames=nfr, stride_m=stride, design_speed_mps=v, authored=dict(cfg), stance={})
        for tag in ('L', 'R'):
            lowz, lowx = [], []
            for f in range(nfr):
                ank, q, _ = poses[f]['feet'][tag]
                P = boot_pts(ank, q, tag)
                i = min(range(len(P)), key=lambda k: P[k].z)
                lowz.append(P[i].z); lowx.append(P[i].x + v * f / fps)
            lowz = np.array(lowz); lowx = np.array(lowx)
            vx = np.array([(lowx[(f + 1) % nfr] + (v * T if f + 1 >= nfr else 0) - lowx[f - 1] + (v * T if f - 1 < 0 else 0)) / (2 / fps) for f in range(nfr)])
            st = (lowz - lowz.min() < 0.03) & (np.abs(vx) < 0.35 * v)
            best, cur, start, bstart = 0, 0, 0, 0
            for k in range(2 * nfr):
                if st[k % nfr]:
                    if cur == 0: start = k
                    cur += 1
                    if cur > best: best, bstart = cur, start
                else:
                    cur = 0
            best = min(best, nfr - 2)
            report['stance'][tag] = dict(start=bstart % nfr, frames=best, duty=best / nfr)
            piv, anchor, Pprev = None, None, None
            for k in range(best):
                f = (bstart + k) % nfr
                t = (bstart + k) / fps
                ank, q, _ = poses[f]['feet'][tag]
                P = boot_pts(Vector((0, 0, 0)), q, tag)
                zmin = min(p.z for p in P)
                if piv is None or P[piv].z > zmin + 0.001:
                    cand = min(range(len(P)), key=lambda i: P[i].z)
                    if piv is None:
                        anchor = ank.x + P[cand].x + v * t     # world x of the new pivot at first contact
                    else:
                        prev_world_ank = pinned[tag][(f - 1) % nfr].x + v * (t - 1 / fps)
                        anchor = prev_world_ank + Pprev[cand].x
                    piv = cand
                ax = anchor - v * t - P[piv].x
                pinned[tag][f] = Vector((ax, ank.y, -P[piv].z))
                contact[tag][f] = True
                Pprev = P
            # correction carried through swing (smoothstep between lift-off and next touchdown)
            d = [None] * nfr
            for f in range(nfr):
                if pinned[tag][f] is not None:
                    d[f] = pinned[tag][f] - poses[f]['feet'][tag][0]
                    dzs.append(d[f].z)
            end = (bstart + best - 1) % nfr; nxt = bstart % nfr
            sw = nfr - best
            for k in range(1, sw + 1):
                f = (end + k) % nfr
                a = k / (sw + 1); a = a * a * (3 - 2 * a)
                d[f] = d[end].lerp(d[nxt], a)
            for f in range(nfr):
                ank, q, pole = poses[f]['feet'][tag]
                ank = ank + d[f]
                if not contact[tag][f] and knee_max:
                    # AUTHORED knee limit (swing only): G24's thick thigh/shin skin folds past ~100 deg
                    # (A6 knee-pit crossing). Push the ankle target away from the hip along the leg line.
                    P_ = poses[f]
                    hip = P_['hip'] + P_['pelvis'] @ Vector((0, (1 if tag == 'L' else -1) * HIP_Y, 0))
                    dv = ank - hip
                    dmin = math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * math.cos(math.pi - knee_max))
                    if dv.length < dmin:
                        ank = hip + dv.normalized() * dmin
                if not contact[tag][f]:
                    k_sw = ((f - end) % nfr) / (sw + 1)
                    need = 0.006 + cfg['swing_clear'] * math.sin(math.pi * k_sw)
                    low = min(p.z for p in boot_pts(ank, q, tag))
                    if low < need: ank = ank + Vector((0, 0, need - low))
                poses[f]['feet'][tag] = (ank, q, pole)

        report['boot_separation_push_max_m'] = separate_boots(poses, contact, boot_pts, periodic=True)
        return poses, contact, report, float(np.mean(dzs))

    poses, contact, report, dz = build()
    hip_off += dz            # stance legs keep the measured hip-to-ankle geometry on average
    poses, contact, report, dz2 = build()
    report['hip_height_m'] = hip_off
    report['stance_dz_residual_m'] = dz2
    frames = []
    stretch_max = 0.0
    for f in range(nfr):
        local, stretch = solve_pose_world(poses[f])
        stretch_max = max(stretch_max, *stretch.values())
        frames.append((local, {k: contact[k][f] for k in contact}))
    report['ik_overstretch_max_m'] = stretch_max
    return frames, report


def separate_boots(poses, contact, boot_pts, gap=0.006, periodic=True, both_ok=()):
    """AUTHORED: CMU feet track close to the midline; G24's boots are 17 cm wide, so in passing the swing
    boot can cut the stance boot. Where the two boot point clouds overlap in x and z, push the swing
    foot(s) outward in y until their y-ranges are `gap` apart. The per-frame push is max/average
    filtered over neighbouring frames so it eases in and out. Stance feet are never moved."""
    n = len(poses)
    push = [0.0] * n
    for k in range(n):
        L = boot_pts(poses[k]['feet']['L'][0], poses[k]['feet']['L'][1], 'L')
        R = boot_pts(poses[k]['feet']['R'][0], poses[k]['feet']['R'][1], 'R')
        ox = min(max(p.x for p in L), max(p.x for p in R)) - max(min(p.x for p in L), min(p.x for p in R))
        oz = min(max(p.z for p in L), max(p.z for p in R)) - max(min(p.z for p in L), min(p.z for p in R))
        if ox > 0 and oz > 0:
            push[k] = max(0.0, max(p.y for p in R) - min(p.y for p in L) + gap)
    idx = (lambda k: k % n) if periodic else (lambda k: max(0, min(n - 1, k)))
    mx = [max(push[idx(k + j)] for j in (-2, -1, 0, 1, 2)) for k in range(n)]
    sm = [(mx[idx(k - 1)] + 2 * mx[k] + mx[idx(k + 1)]) / 4 for k in range(n)]
    sm = [max(a, b) for a, b in zip(sm, push)]
    for k in range(n):
        if sm[k] <= 0: continue
        movers = [t for t in ('L', 'R') if not contact[t][k]] or []
        if not movers:
            # both planted (push-off): split the push only where no foot is pivot-locked yet;
            # the planted pivot stays where it is (only y), so slip is unchanged in x
            movers = list(both_ok) if both_ok else []
            if not movers: continue
        each = sm[k] / len(movers)
        for t in movers:
            a = poses[k]['feet'][t][0]
            sg = 1 if t == 'L' else -1
            new = Vector((a.x, a.y + sg * each, a.z))
            ft = poses[k]['feet'][t]
            poses[k]['feet'][t] = (new,) + tuple(ft[1:]) if isinstance(ft, tuple) else [new] + list(ft[1:])
    return max(push) if push else 0.0


# ===================================================================== one-shot clips (jump / land)
# AUTHORED (G24 choices, recorded in the build report):
#  * stand jump/landing feet are placed at the Idle stance (x 0.015, y +-(HIP_Y+0.008)); RunJump keeps
#    the measured hip-relative foot placement;
#  * the physics launches on the key press (main thread, 5 m/s, gravity 12.5), so JumpStart only covers
#    the last ~0.1 s of measured push-off; the air clips are POSES sampled over the measured flight,
#    played by vertical speed (rise -> apex at 50 % -> fall), not by time;
#  * air pelvis follows only AIR_HIP_FOLLOW of the measured flight hip arc (physics does the real arc);
#  * arms: forward swing clamped to ARM_SWING_MAX (overhead arms hit the helmet on G24);
#  * Land ends blended into the Idle frame-0 pose (last LAND_TO_IDLE of the clip).
ONESHOT = {
    'JumpStart': dict(source='jump', a=('takeoff', -0.117), b=('takeoff', 0.0), kind='start', stance='idle', speed=0.0),
    'JumpAir': dict(source='jump', a=('takeoff', 0.0), b=('touchdown', 0.0), kind='air', stance='idle', speed=0.0),
    'RunJumpStart': dict(source='runjump', a=('takeoff', -0.1), b=('takeoff', 0.0), kind='start', stance='source', speed=3.6),
    'RunJumpAir': dict(source='runjump', a=('takeoff', 0.0), b=('touchdown', 0.0), kind='air', stance='source', speed=0.0),
    'Land': dict(source='jump', a=('touchdown', 0.0), b=('absorb', 0.30), kind='land', stance='idle', speed=0.0),
}
ONE_CFG = dict(arm_swing_scale=0.85, arm_min_abd_deg=30.0, elbow_max_deg=80.0, arm_swing_max_deg=70.0, head_follow=0.6,
               knee_max_deg=105.0, air_hip_follow=0.35, air_frames_half=12, land_to_idle=0.45, idle_y_extra=0.008)


class Seq:
    """Non-periodic access to a measured one-shot take (fractional source frames)."""

    def __init__(self, O):
        self.O = O
        self.n = O['frames']; self.fps = O['fps']; self.leg = O['leg_m']; self.ankle_stand = O['ankle_stand']
        self.rot = {k: [q_of(q) for q in v] for k, v in O['rot'].items()}
        self.pos = {k: np.array(v) for k, v in O['pos'].items()}
        self.hip = np.array(O['hip'])
        self.rest = {k: Vector(v).normalized() for k, v in O['rest_dir'].items()}
        self.ev = O['events']

    def _ix(self, x):
        x = max(0.0, min(self.n - 1.0, x))
        i = int(math.floor(x)); j = min(i + 1, self.n - 1)
        return i, j, x - i

    def q(self, seg, x):
        i, j, a = self._ix(x)
        return self.rot[seg][i].slerp(self.rot[seg][j], a)

    def p(self, seg, x):
        i, j, a = self._ix(x)
        return Vector(self.pos[seg][i] * (1 - a) + self.pos[seg][j] * a)

    def h(self, x):
        i, j, a = self._ix(x)
        return Vector(self.hip[i] * (1 - a) + self.hip[j] * a)


# v3d extra one-shots (prepare_extra.py; CMU 143_18 sit, 69_16/69_18 turns, 100STYLE Neutral_ID). kind 'free':
# every frame may be in contact (feet pinned by the same offline contact bake), pelvis travel kept
# (keep_hip: hip x/y relative to the reference event, so sitting moves back onto the seat with the feet planted).
# AUTHORED (A6): G24's short TABS thigh skin folds into the pelvis at a full 90 deg seated hip flexion, so the
# sit is a perched one: the hip never goes lower than SIT_HIP_MIN above the soles and the measured backward
# pelvis tilt is scaled by SIT_TILT. Recorded in the build report.
SIT_HIP_MIN = float(os.environ.get('G24_SIT_HIP_MIN', '0.52'))
SIT_TILT = float(os.environ.get('G24_SIT_TILT', '0.35'))
EXTRA_SRC = os.path.expanduser('~/.cache/g24-extra/g24_extra_motion.json')
EXTRA = {
    'SitDown': dict(source='sit', a=('down0', -0.1), b=('seat', 0.05), kind='free', stance='source', speed=0.0, keep_hip='seat', hip_z_min=SIT_HIP_MIN, pelvis_tilt=SIT_TILT, feet_apart=0.135),
    'SitIdle': dict(source='sit', a=('seat', 0.15), b=('seat', 0.75), kind='free', stance='source', speed=0.0, keep_hip='seat', hip_z_min=SIT_HIP_MIN, pelvis_tilt=SIT_TILT, feet_apart=0.135),
    'StandUp': dict(source='sit', a=('up0', -0.05), b=('stand', 0.2), kind='free', stance='source', speed=0.0, keep_hip='seat', hip_z_min=SIT_HIP_MIN, pelvis_tilt=SIT_TILT, feet_apart=0.135),
    'TurnL': dict(source='turnL', a=('turn0', -0.1), b=('turn1', 0.12), kind='free', stance='source', speed=0.0, pin=False),
    'TurnR': dict(source='turnR', a=('turn0', -0.1), b=('turn1', 0.12), kind='free', stance='source', speed=0.0, pin=False),
    'IdleLook': dict(source='idlelook', a=('start', 0.45), b=('start', 2.3), kind='free', stance='idle', speed=0.0),
}


def load_extra():
    return json.load(open(EXTRA_SRC))


def make_oneshot_clips(data, REST, BOOT, consts, solve_pose_world, idle_local, fps=60, specs=None):
    """Returns {name: (frames [(local, contact)], report)} for ONESHOT."""
    Lg = consts['LEG']; ANKLE_Z, HIP_Y = consts['ANKLE_Z'], consts['HIP_Y']
    C = ONE_CFG
    rest_dir = lambda b: (REST[b]['tail'] - REST[b]['head']).normalized()
    l1 = (REST['thigh.L']['tail'] - REST['thigh.L']['head']).length
    l2 = (REST['shin.L']['tail'] - REST['shin.L']['head']).length
    offs = [Vector(o) for o in BOOT['offsets']]

    def boot_pts(ank, q, tag):
        m = Vector((1, -1, 1)) if tag == 'L' else Vector((1, 1, 1))
        return [ank + q @ Vector((o.x * m.x, o.y * m.y, o.z * m.z)) for o in offs]

    out = {}
    for name, spec in (specs or ONESHOT).items():
        sq = Seq(data['oneshots'][spec['source']])
        s = Lg / sq.leg
        ev = lambda e: sq.ev[e[0]] + e[1] * sq.fps
        xa, xb = ev(spec['a']), ev(spec['b'])
        off = {}
        for side, tag in (('l', 'L'), ('r', 'R')):
            off[f'foot.{tag}'] = rest_offset(rest_dir(f'foot.{tag}'), sq.rest[f'{side}foot'])
        off['spine'] = rest_offset(rest_dir('spine'), sq.rest['upperback'])
        off['chest'] = rest_offset(rest_dir('chest'), sq.rest['thorax'])
        off['head'] = rest_offset(rest_dir('head'), sq.rest['head'])
        kind = spec['kind']
        if kind == 'air':
            # two halves resampled to equal frame counts: phase 0.5 == measured apex
            xm = float(sq.ev['apex'])
            nh = C['air_frames_half']
            xs = [xa + (xm - xa) * k / nh for k in range(nh)] + [xm + (xb - xm) * k / nh for k in range(nh + 1)]
        else:
            dur = (xb - xa) / sq.fps * math.sqrt(s)
            nfr = max(3, int(round(dur * fps)))
            xs = [xa + (xb - xa) * k / nfr for k in range(nfr + 1)]
        n = len(xs)
        hip_td = sq.h(sq.ev.get('touchdown', 0)).z
        hip_ref = sq.h(sq.ev[spec['keep_hip']]) if spec.get('keep_hip') else None
        dzh = [0.0]          # stance re-solve offset applied inside raw()

        def raw(x):
            D = {}
            D['pelvis'] = sq.q('root', x)
            D['spine'] = sq.q('upperback', x) @ off['spine']
            D['chest'] = sq.q('thorax', x) @ off['chest']
            D['head'] = D['chest'].slerp(sq.q('head', x) @ off['head'], C['head_follow'])
            cinv = D['chest'].inverted(); arms = {}
            for side, tag, sg in (('l', 'L', 1), ('r', 'R', -1)):
                sh = sq.p(f'{side}clavicle', x); el = sq.p(f'{side}humerus', x); wr = sq.p(f'{side}radius', x)
                dc = (cinv @ (el - sh)).normalized()
                swing = max(-math.radians(C['arm_swing_max_deg']), min(math.radians(C['arm_swing_max_deg']),
                                                                       math.atan2(dc.x, -dc.z) * C['arm_swing_scale']))
                abd = max(math.asin(max(-1.0, min(1.0, dc.y * sg))), math.radians(C['arm_min_abd_deg']))
                ca = math.cos(abd)
                d2 = Vector((ca * math.sin(swing), sg * math.sin(abd), -ca * math.cos(swing)))
                rd = rest_dir(f'upperarm.{tag}')
                Qu = D['chest'] @ rd.rotation_difference(d2)
                flex = min((el - sh).angle(wr - el), math.radians(C['elbow_max_deg']))
                arms[tag] = (Qu, Qu @ Quaternion(rd.cross(Vector((1, 0, 0))).normalized(), flex))
            D['arms'] = arms
            hipz_src = sq.h(x).z
            if kind == 'air':
                hz = (hipz_src - hip_td) * C['air_hip_follow'] * Lg       # + c, solved below
            else:
                hz = ANKLE_Z + (hipz_src - sq.ankle_stand) * Lg + dzh[0]  # dz re-solved from stance
            hx = hy = 0.0
            if hip_ref is not None:
                hh = sq.h(x); hx = (hh.x - hip_ref.x) * Lg; hy = (hh.y - hip_ref.y) * Lg
            if spec.get('hip_z_min') is not None:
                hz = max(hz, spec['hip_z_min'])
            if spec.get('feet_apart'):
                # AUTHORED (A6): seated knees-together feet put the two 17 cm boots into each other; keep each
                # foot track at least feet_apart from the midline (same rule as the standing Idle stance)
                pass
            if spec.get('pelvis_tilt') is not None:
                D['pelvis'] = Quaternion().slerp(D['pelvis'], spec['pelvis_tilt'])
                # spine follows the pelvis half-way toward the chest so the waist bends over two joints
                D['spine'] = D['pelvis'].slerp(D['chest'], 0.5)
            D['hip'] = Vector((hx, hy, hz))
            feet = {}
            for side, tag, sg in (('l', 'L', 1), ('r', 'R', -1)):
                a = sq.p(f'{side}tibia', x); hj = sq.p(f'{side}hipjoint', x); kn = sq.p(f'{side}femur', x)
                ax_, ay = a.x * Lg + hx, sg * HIP_Y + (a.y - hj.y) * Lg + hy
                az = hz + (a.z - hipz_src) * Lg
                pole = (kn - hj) - ((a - hj).normalized() * (kn - hj).dot((a - hj).normalized()))
                if spec.get('feet_apart'): ay = sg * max(sg * ay, spec['feet_apart'])
                feet[tag] = [Vector((ax_, ay, az)), sq.q(f'{side}foot', x) @ off[f'foot.{tag}'],
                             pole.normalized() if pole.length > 1e-6 else Vector((1, 0, 0))]
            D['feet'] = feet
            return D

        # AUTHORED: for Idle-stance clips the measured foot orientation is re-referenced so the boot is
        # exactly flat (G24 Idle foot) at the standing reference frame (JumpStart: first, Land: last);
        # the same correction applies to every frame, so the measured roll is kept relative to it.
        footcorr = {'L': Quaternion(), 'R': Quaternion()}
        if spec['stance'] == 'idle':
            xref = xs[0] if kind in ('start', 'air') else xs[-1]
            for side, tag in (('l', 'L'), ('r', 'R')):
                qref = sq.q(f'{side}foot', xref) @ off[f'foot.{tag}']
                fw = qref @ Vector((1, 0, 0)); yaw = math.atan2(fw.y, fw.x)
                footcorr[tag] = Quaternion((0, 0, 1), yaw) @ qref.inverted()
        rawf = raw

        def raw(x):
            D = rawf(x)
            for tag in ('L', 'R'):
                q = footcorr[tag] @ D['feet'][tag][1]
                if spec['stance'] == 'idle':
                    # ... and no inward roll either (the measured supination tips the shaft rims
                    # of the two 17 cm boots into each other): keep pitch only
                    fw = q @ Vector((1, 0, 0))
                    pitch = math.atan2(-fw.z, math.hypot(fw.x, fw.y))
                    q = Quaternion((0, 1, 0), pitch)
                    D['feet'][tag][1] = q
                    continue
                    # AUTHORED: Idle-stance clips keep the measured foot pitch/roll but not its yaw
                    # (CMU 16 toes in ~10 deg during push-off; G24's wide boots then cut each other)
                    fw = q @ Vector((1, 0, 0))
                    q = Quaternion((0, 0, 1), -math.atan2(fw.y, fw.x)) @ q
                D['feet'][tag][1] = q
            return D
        poses = [raw(x) for x in xs]
        rep = dict(source=spec['source'], take=sq.O['take'], src_frames=[round(xa, 2), round(xb, 2)], scale_s=s,
                   frames=n - 1, kind=kind, authored=dict(C), spec={k: v for k, v in spec.items()})
        contact = {'L': [False] * n, 'R': [False] * n}
        idle_xy = {'L': Vector((0.015, HIP_Y + C['idle_y_extra'])), 'R': Vector((0.015, -(HIP_Y + C['idle_y_extra'])))}
        if kind == 'air':
            # feet blend to the landing stance over the last 35 % of the fall (stand: Idle stance)
            for k, P in enumerate(poses):
                u = k / (n - 1)
                w = max(0.0, (u - 0.65) / 0.35); w = w * w * (3 - 2 * w)
                for tag in ('L', 'R'):
                    ank = P['feet'][tag][0]
                    if spec['stance'] == 'idle':
                        tgt = Vector((idle_xy[tag].x, idle_xy[tag].y, ank.z))
                    else:
                        tgt = Vector((ank.x, (1 if tag == 'L' else -1) * (HIP_Y + C['idle_y_extra']), ank.z))
                    P['feet'][tag][0] = ank.lerp(tgt, w)
            last = poses[-1]
            low = min(min(p.z for p in boot_pts(last['feet'][t][0], last['feet'][t][1], t)) for t in ('L', 'R'))
            c = -low
            for P in poses:
                P['hip'].z += c
                for tag in ('L', 'R'): P['feet'][tag][0].z += c
            # never let a mid-air foot dip below the touchdown sole plane
            for P in poses:
                for tag in ('L', 'R'):
                    lo = min(p.z for p in boot_pts(P['feet'][tag][0], P['feet'][tag][1], tag))
                    if lo < 0: P['feet'][tag][0].z -= lo
            rep['hip_height_m'] = [round(P['hip'].z, 4) for P in (poses[0], poses[n // 2], poses[-1])]
        else:
            v = spec['speed']
            for tag, side in (('L', 'l'), ('R', 'r')):
                for k, x in enumerate(xs):
                    if kind == 'land':
                        contact[tag][k] = True
                    elif spec['stance'] == 'idle':
                        contact[tag][k] = k < n - 1 or kind == 'free'
                    else:
                        lo_src = min(sq.p(f'{side}tibia', x).z - sq.ankle_stand, sq.p(f'{side}toes', x).z - 0.0)
                        contact[tag][k] = lo_src < 0.05 and (k < n - 1 or kind == 'free')
            if not spec.get('pin', True):
                # unpinned (turn in place): the measured stepping is kept; each boot only rests on / above y = 0
                for P in poses:
                    for tag in ('L', 'R'):
                        a_ = P['feet'][tag][0]; sg_ = 1 if tag == 'L' else -1
                        # AUTHORED (A6): the pivoting source feet cross the midline; G24's 17 cm boots then cut
                        # each other. Each ankle stays at least HIP_Y + 1 cm on its own side of the pelvis.
                        loc = P['pelvis'].inverted() @ (a_ - P['hip'])
                        if sg_ * loc.y < HIP_Y + 0.01:
                            loc.y = sg_ * (HIP_Y + 0.01); a_ = P['hip'] + P['pelvis'] @ loc
                        P['feet'][tag][0] = a_
                        lo = min(p.z for p in boot_pts(P['feet'][tag][0], P['feet'][tag][1], tag))
                        P['feet'][tag][0].z -= lo if lo < 0.004 else 0.0
                rep['boot_separation_push_max_m'] = separate_boots(poses, {'L': [False] * n, 'R': [False] * n}, boot_pts, periodic=False)
            for it in (range(2) if spec.get('pin', True) else ()):
                dzs = []
                for tag in ('L', 'R'):
                    frames_c = [k for k in range(n) if contact[tag][k]]
                    piv, anchor, prev, Pprev = None, None, None, None
                    for k in frames_c:
                        t = k / fps
                        ank, q, _ = poses[k]['feet'][tag]
                        if spec['stance'] == 'idle':
                            ank = Vector((idle_xy[tag].x, idle_xy[tag].y, ank.z))
                        P0 = boot_pts(Vector((0, 0, 0)), q, tag)
                        zmin = min(p.z for p in P0)
                        if piv is None or P0[piv].z > zmin + 0.001:
                            cand = min(range(len(P0)), key=lambda i: P0[i].z)
                            if piv is None:
                                anchor = Vector((ank.x + P0[cand].x + v * t, ank.y + P0[cand].y))
                            else:
                                anchor = Vector((prev.x + v * (t - 1 / fps) + Pprev[cand].x, prev.y + Pprev[cand].y))
                            piv = cand
                        new = Vector((anchor.x - v * t - P0[piv].x, anchor.y - P0[piv].y, -P0[piv].z))
                        dzs.append(new.z - poses[k]['feet'][tag][0].z)
                        poses[k]['feet'][tag][0] = new
                        prev = new; Pprev = P0
                    # after lift-off the remaining source path continues from the last pinned offset
                    if frames_c and frames_c[-1] < n - 1:
                        k0 = frames_c[-1]
                        d0 = None
                        for k in range(k0 + 1, n):
                            ank = poses[k]['feet'][tag][0]
                            if d0 is None:
                                src_prev = raw(xs[k0])['feet'][tag][0]
                                d0 = poses[k0]['feet'][tag][0] - src_prev
                            poses[k]['feet'][tag][0] = ank + d0
                if kind == 'land':
                    # AUTHORED: after touchdown both boots are planted flat at the Idle stance for the
                    # whole absorb (the measured landing rolls/yaws the feet a few degrees, which on
                    # the wide G24 boot sweeps sole vertices by 4-5 cm). Frame 0 keeps the measured
                    # toe-first approach, 2 cm above the floor; the body (pelvis, spine, arms, knee
                    # bend through the IK) keeps the measured absorb.
                    flat = Quaternion()
                    for tag in ('L', 'R'):
                        for k in range(n):
                            ank, q, pole = poses[k]['feet'][tag]
                            if k == 0:
                                lo = min(p.z for p in boot_pts(Vector((idle_xy[tag].x, idle_xy[tag].y, 0)), q, tag))
                                poses[k]['feet'][tag] = [Vector((idle_xy[tag].x, idle_xy[tag].y, 0.02 - lo)), q, pole]
                                contact[tag][k] = False
                            else:
                                lo = min(p.z for p in boot_pts(Vector((0, 0, 0)), flat, tag))
                                poses[k]['feet'][tag] = [Vector((idle_xy[tag].x, idle_xy[tag].y, -lo)), flat, pole]
                    break
                if it == 0 and dzs and kind != 'land':
                    dzh[0] = float(np.mean(dzs))
                    poses = [raw(x) for x in xs]
                    rep['stance_dz_m'] = dzh[0]
                else:
                    break
        rep['boot_separation_push_max_m'] = separate_boots(poses, contact, boot_pts, periodic=False)
        # swing knee limit (same authored rule as the loops)
        km = math.radians(C['knee_max_deg'])
        dmin = math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * math.cos(math.pi - km))
        for k, P in enumerate(poses):
            for tag in ('L', 'R'):
                if contact[tag][k]: continue
                hip = P['hip'] + P['pelvis'] @ Vector((0, (1 if tag == 'L' else -1) * HIP_Y, 0))
                dv = P['feet'][tag][0] - hip
                if dv.length < dmin: P['feet'][tag][0] = hip + dv.normalized() * dmin
        frames, stretch_max = [], 0.0
        for k, P in enumerate(poses):
            P2 = dict(P); P2['feet'] = {t: tuple(P['feet'][t]) for t in ('L', 'R')}
            local, stretch = solve_pose_world(P2)
            stretch_max = max(stretch_max, *stretch.values())
            frames.append((local, {t: contact[t][k] for t in contact}))
        if kind == 'land':
            # blend into the Idle frame-0 pose over the last land_to_idle of the clip
            n0 = int(round(len(frames) * (1 - C['land_to_idle'])))
            for k in range(n0, len(frames)):
                w = (k - n0) / max(1, len(frames) - 1 - n0); w = w * w * (3 - 2 * w)
                loc = {}
                for bn, (qq, ll) in frames[k][0].items():
                    qi, li = idle_local[bn]
                    loc[bn] = (qq.slerp(qi, w), ll.lerp(li, w))
                frames[k] = (loc, frames[k][1])
        rep['ik_overstretch_max_m'] = stretch_max
        rep['design_speed_mps'] = spec['speed']
        if 'yaw' in sq.O:   # measured heading curve (rad, relative), one value per output frame
            yw = sq.O['yaw']
            rep['yaw_curve'] = [round(float(np.interp(x, range(len(yw)), yw)), 5) for x in xs]
        out[name] = (frames, rep)
    return out
