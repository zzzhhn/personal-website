"""A6 extreme-pose close-up sheet: python3 compose_extremes.py DIR OUT.png"""
import json, os, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
log = json.load(open(os.path.join(d, 'extremes.json')))
w = 300; ncol = 4
rows = (len(log) + ncol - 1) // ncol
S = Image.new('RGB', (w * ncol, w * rows + 24), (30, 30, 32)); dr = ImageDraw.Draw(S)
dr.text((6, 5), open(os.path.join(d, 'source.txt')).read() + ' | A6 peak-flex close-ups (angle = bone-to-bone)', fill=(230, 230, 230))
for k, e in enumerate(log):
    x, y = (k % ncol) * w, (k // ncol) * w + 24
    S.paste(Image.open(os.path.join(d, e['file'])).convert('RGB').resize((w, w)), (x, y))
    dr.text((x + 4, y + 4), f"{e['joint']}.{e['side']} {e['clip']} t={e['t_s']}s {e['angle_deg']}deg {e['file'].split('_')[-1][:-4]}", fill=(10, 10, 10))
S.save(out); print('XSHEET', out, len(log))
