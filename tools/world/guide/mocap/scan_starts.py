"""Find candidate stationary-to-moving windows in cached 100STYLE BVH root tracks.

This is source selection evidence, not a retarget/contact/animation acceptance test.
Uses the centimetre convention documented by bvh_motion.py, without loading a mesh.
Raw data stays in the cache. Output records source hashes and zero-based frame ranges.
Run: python3 scan_starts.py SOURCE_DIRECTORY OUTPUT_JSON
"""
import hashlib
import csv
import json
import math
import statistics
import sys
from pathlib import Path


def scan(path, cuts):
    raw = path.read_bytes()
    lines = raw.decode().splitlines()
    motion = next(i for i, line in enumerate(lines) if line.strip() == 'MOTION')
    channels = next(line.split()[2:] for line in lines[:motion] if line.strip().startswith('CHANNELS'))
    indices = [channels.index(axis + 'position') for axis in 'XZ']
    frame_time = float(lines[motion + 2].split(':')[1])
    fps = 1 / frame_time
    points = []
    for line in lines[motion + 3:]:
        if line.strip():
            fields = line.split()
            points.append(tuple(float(fields[i]) * .01 for i in indices))
    assert len(points) == int(lines[motion + 1].split(':')[1])
    radius = max(1, round(fps * .1))
    speed = []
    for i in range(len(points)):
        a, b = max(0, i - radius), min(len(points) - 1, i + radius)
        distance = math.dist(points[a], points[b])
        speed.append(distance / max(frame_time, (b - a) * frame_time))
    style, movement = path.stem.rsplit('_', 1)
    cut = cuts.get(style, {})
    cut_range = [int(cut[movement + suffix]) for suffix in ('_START', '_STOP')] if cut else None
    candidates, excluded, start = [], [], None
    for i, value in enumerate(speed + [math.inf]):
        if value < .18:
            if start is None:
                start = i
        elif start is not None:
            if i - start >= round(.3 * fps) and i < len(speed):
                end = min(len(speed), i + round(1.5 * fps))
                peak = max(speed[i:end], default=0)
                if peak >= .8:
                    row = {
                        'stationaryFramesInclusive': [start, i - 1],
                        'stationarySeconds': (i - start) * frame_time,
                        'movingFramesHalfOpen': [i, end],
                        'peakSpeedNext1p5sMps': peak,
                        'speedAt0p3sMps': speed[min(len(speed) - 1, i + round(.3 * fps))],
                        'speedAt0p6sMps': speed[min(len(speed) - 1, i + round(.6 * fps))],
                        'displacementNext1p5sMetres': math.dist(points[i], points[end - 1]),
                    }
                    # CSV index endpoints are kept verbatim. Require a one-frame interior margin
                    # rather than claiming to know whether the author's endpoint is inclusive.
                    if cut_range and start > cut_range[0] and end < cut_range[1]:
                        candidates.append(row)
                    else:
                        excluded.append(row)
            start = None
    return {
        'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest(),
        'frames': len(points), 'fps': fps,
        'medianPlanarRootSpeedMps': statistics.median(speed),
        'authorCutRangeVerbatim': cut_range, 'candidates': candidates,
        'excludedOutsideAuthorCuts': excluded,
    }


if __name__ == '__main__':
    source, output = map(Path, sys.argv[1:3])
    cut_path = source / 'Frame_Cuts.csv'
    cuts = {row['STYLE_NAME']: row for row in csv.DictReader(cut_path.open())} if cut_path.exists() else {}
    result = {
        'scope': 'source root-track scan only; no retarget, contact or visual acceptance',
        'method': {
            'positionUnits': 'centimetres converted to metres, same as bvh_motion.py',
            'velocityHalfWindowSeconds': .1, 'stationaryBelowMps': .18,
            'minimumStationarySeconds': .3, 'candidatePeakNext1p5sAtLeastMps': .8,
            'frameIndexing': 'zero based; range convention named per field',
            'authorCutPolicy': 'require stationary and moving windows strictly inside author cuts with one-frame margin',
        },
        'authorCutsSha256': hashlib.sha256(cut_path.read_bytes()).hexdigest() if cuts else None,
        'sources': [scan(path, cuts) for path in sorted(source.glob('*.bvh'))],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'sources': len(result['sources']),
                      'candidates': sum(len(s['candidates']) for s in result['sources'])}))
