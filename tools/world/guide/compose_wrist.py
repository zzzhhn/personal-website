"""Wrist close-up sheet: python3 compose_wrist.py WRISTDIR OUT.png"""
import glob, os, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(os.path.join(d, 'wrist_*.png')), key=lambda f: (f.endswith('side.png'), f))
ims = [Image.open(f).convert('RGB').resize((420, 420)) for f in fs]
S = Image.new('RGB', (420 * 3, 420 * 2 + 24), (30, 30, 32)); dr = ImageDraw.Draw(S)
dr.text((6, 5), open(os.path.join(d, 'source.txt')).read() + ' | right wrist close-ups', fill=(230, 230, 230))
for k, (im, f) in enumerate(zip(ims, fs)):
    x, y = (k % 3) * 420, (k // 3) * 420 + 24
    S.paste(im, (x, y)); dr.text((x + 4, y + 4), os.path.basename(f)[8:-4], fill=(10, 10, 10))
S.save(out); print('WRISTSHEET', out, len(fs))
