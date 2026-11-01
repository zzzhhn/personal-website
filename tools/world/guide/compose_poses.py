"""Pose contact sheet: python3 compose_poses.py POSEDIR OUT.png"""
import glob, os, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
rows = []
for view in ('side', 'q34'):
    fs = sorted(glob.glob(os.path.join(d, f'{view}_*.png')), key=lambda f: (['Walk', 'Run', 'Jump', 'Land', 'Idle'].index(os.path.basename(f).split('_')[1]), f))
    # one row per 6 frames so a sheet stays readable (Walk / Run / Jump+Land+Idle)
    rows += [fs[i:i + 6] for i in range(0, len(fs), 6)]
w, h = 280, 360
ncol = max(len(r) for r in rows)
S = Image.new('RGB', (w * ncol, h * len(rows) + 24), (30, 30, 32))
dr = ImageDraw.Draw(S)
src = open(os.path.join(d, 'source.txt')).read() if os.path.exists(os.path.join(d, 'source.txt')) else ''
dr.text((6, 5), src + ' | in-place clips; frame times in ms', fill=(230, 230, 230))
for r, fs in enumerate(rows):
    for c, f in enumerate(fs):
        im = Image.open(f).convert('RGB').resize((w, h))
        S.paste(im, (c * w, r * h + 24))
        dr.text((c * w + 3, r * h + 27), os.path.basename(f)[:-4].split('_', 1)[1], fill=(10, 10, 10))
S.save(out)
print('POSESHEET', out)
