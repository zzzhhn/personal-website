#!/usr/bin/env python3
"""Small, reproducible CMU dance extraction. Requires numpy; never invokes Blender.

Uses the existing ASF/AMC parser and heading normalization. Source frame indices are
zero-based. These are salsa- and twist-derived candidates, not captured disco/step-touch.
"""
import hashlib
import json
import pathlib
import sys
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'mocap'))
from cmu_motion import load, mat2quat, slerp, qmul, qinv
from asf_amc import parse_asf

ROOT = HERE.parents[3]
OUTPUT = ROOT / 'src/components/world/guide-data/cmu-club.json'
AXES = np.array([[1., 0, 0], [0, 0, 1], [0, -1, 0]])
SEGS = ['root', 'upperback', 'thorax', 'head', 'lhumerus', 'lradius', 'rhumerus', 'rradius', 'lfoot', 'rfoot']
POINTS = ['lhipjoint', 'lfemur', 'ltibia', 'ltoes', 'rhipjoint', 'rfemur', 'rtibia', 'rtoes']
SPECS = [('ClubGroove', '60', '60_01', 60, 156, 314, 'salsa basic-step adaptation'),
         ('ClubDisco', '141', '141_12', 120, 244, 408, 'twist adaptation, not captured disco')]


def rounded(a):
    return np.round(a, 6).tolist()


def periodic(a):
    """Remove endpoint drift, preserving the measured interior rather than reversing it."""
    u = np.linspace(0, 1, len(a))
    w = u ** 3 * (10 - 15 * u + 6 * u * u)
    return a - w[:, None] * (a[-1] - a[0])


def build():
    result = dict(version=1, axes='Three Y-up; +X forward; -Z left', clips=[])
    for name, subject, take, fps, start, end, description in SPECS:
        data = load(str(HERE / 'source'), subject + '.asf', take + '.amc', fps, 'hips')
        bones, _ = parse_asf(str(HERE / 'source' / (subject + '.asf')))
        # Sample at 60 Hz. End point is included, explicitly closing the loop.
        count = round((end - start) / fps * 60)
        indices = np.linspace(start, end, count + 1)
        lo = indices.astype(int)
        hi = np.minimum(lo + 1, data['n'] - 1)
        frac = indices - lo
        interp = lambda a: a[lo] * (1 - frac[:, None]) + a[hi] * frac[:, None]
        leg = data['leg']
        raw_hip = interp(data['hipmid']) @ AXES.T
        # Translate the loop into a local dance space. Captured sway and vertical
        # compression remain; only net travel is removed, never root motion by frame.
        hip = periodic(raw_hip / leg)
        hip[:, [0, 2]] -= (hip[:, [0, 2]].max(0) + hip[:, [0, 2]].min(0)) / 2
        points = {}
        for seg in POINTS:
            relative = (interp(data['pos'][seg]) @ AXES.T - raw_hip) / leg
            points[seg] = periodic(relative)
        rotations = {}
        for seg in SEGS:
            matrices = np.einsum('ij,njk,lk->nil', AXES, data['rot'][seg], AXES)
            qs = [mat2quat(m) for m in matrices]
            qs = [slerp(qs[i], qs[j], f) for i, j, f in zip(lo, hi, frac)]
            delta = qmul(qinv(qs[-1]), qs[0])
            for i in range(len(qs)):
                u = i / count
                w = u ** 3 * (10 - 15 * u + 6 * u * u)
                qs[i] = qmul(qs[i], slerp(np.array([1., 0, 0, 0]), delta, w))
                if i and np.dot(qs[i], qs[i - 1]) < 0:
                    qs[i] *= -1
            rotations[seg] = rounded(np.array(qs)[:, [1, 2, 3, 0]])
        # Contacts are measured from source ankle/toe height AND horizontal speed.
        # Height-only labels would incorrectly pin the sliding feet of a twist.
        contacts = {}
        for side in 'lr':
            ankle = points[side + 'tibia'] + hip
            toe = points[side + 'toes'] + hip
            low = np.minimum(ankle[:, 1], toe[:, 1])
            speed = np.linalg.norm(np.gradient(ankle[:, [0, 2]], axis=0), axis=1) * 60 * leg
            contacts[side] = ((low <= np.percentile(low, 35) + .018 / leg) & (speed < .45)).astype(int).tolist()
            contacts[side][-1] = contacts[side][0]
        hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in [HERE / 'source' / (subject + '.asf'), HERE / 'source' / (take + '.amc')]}
        rest = {seg: rounded(AXES @ np.array([[0, 0, 1.], [1., 0, 0], [0, 1., 0]]) @ bones[seg]['dir'])
                for seg in SEGS if seg != 'root'}
        result['clips'].append(dict(name=name, description=description, source=f'CMU {take}',
            sourceUrl=f'https://mocap.cs.cmu.edu/subjects/{subject}/{take}.amc',
            indexUrl=f'https://mocap.cs.cmu.edu/search.php?subjectnumber={subject}',
            licenseUrl='https://mocap.cs.cmu.edu/', sourceFps=fps,
            sourceFrames=[start, end], duration=count / 60, frames=count, sourceLegM=leg,
            adaptations=['crop', '60 Hz resample', 'heading normalization', 'endpoint drift removal',
                         'quintic endpoint pose correction', 'G24 proportion/boot retarget'],
            sourceSha256=hashes, rest=rest, hip=rounded(hip),
            points={k: rounded(v) for k, v in points.items()}, rotations=rotations, contacts=contacts))
        print(name, count + 1, 'samples;', 'contacts', {k: sum(v) for k, v in contacts.items()})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(OUTPUT.relative_to(ROOT), OUTPUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    build()
