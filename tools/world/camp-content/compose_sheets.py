"""Assemble 3x2 contact sheets from render_views.py tiles. Run with system python3 + Pillow.
python3 compose_sheets.py <out_dir> [suffix] [C07 ...]
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.abspath(sys.argv[1])
SUFFIX = sys.argv[2] if len(sys.argv) > 2 else ''
IDS = sys.argv[3:] or ['C11']
NAMES = {'C11': 'tool wall', 'C12': 'guitar + stand', 'C13': 'hex dumbbell', 'C14': 'wok + stove', 'C15': 'suitcase', 'C16': 'desk lantern', 'L01': 'exit lamp post'}
VIEWS = [('front', 'front (+X)'), ('side', 'side (from +Z glTF)'), ('back', 'back (-X)'),
         ('top', 'top (front up)'), ('34_front', '3/4 front'), ('34_back', '3/4 back')]
T = 480
try:
    font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 18)
    big = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22)
except OSError:
    font = big = ImageFont.load_default()
for aid in IDS:
    sheet = Image.new('RGB', (T * 3, T * 2 + 44), (236, 234, 228))
    d = ImageDraw.Draw(sheet)
    dims = open(os.path.join(OUT, '_tiles', f'{aid}_dims.txt')).read().strip()
    d.text((12, 10), f'{aid} {NAMES.get(aid, "")} | {dims} | GLB fresh import, neutral light', fill=(30, 30, 30), font=big)
    for i, (v, label) in enumerate(VIEWS):
        im = Image.open(os.path.join(OUT, '_tiles', f'{aid}_{v}.png')).convert('RGB').resize((T, T), Image.LANCZOS)
        x, y = (i % 3) * T, 44 + (i // 3) * T
        sheet.paste(im, (x, y))
        d.rectangle((x, y, x + T - 1, y + T - 1), outline=(200, 198, 190))
        d.text((x + 8, y + 6), label, fill=(20, 20, 20), font=font)
    path = os.path.join(OUT, f'{aid}_sixview{SUFFIX}.png')
    sheet.save(path)
    print(path)
