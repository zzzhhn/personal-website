"""Six-view sheet: python3 compose_six.py SIXDIR OUT.png"""
import glob, os, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(os.path.join(d, 'G24_*.png')))
ims = [Image.open(f).convert('RGB').resize((450, 550)) for f in fs]
S = Image.new('RGB', (450 * 3, 550 * 2 + 24), (30, 30, 32)); dr = ImageDraw.Draw(S)
dr.text((6, 5), open(os.path.join(d, 'source.txt')).read() + ' | front=+X, right=glTF +Z', fill=(230, 230, 230))
for i, (im, f) in enumerate(zip(ims, fs)):
    x, y = (i % 3) * 450, (i // 3) * 550 + 24
    S.paste(im, (x, y)); dr.text((x + 5, y + 4), os.path.basename(f)[4:-4], fill=(10, 10, 10))
S.save(out); print('SIX', out)
