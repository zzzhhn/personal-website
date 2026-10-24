"""Side-by-side before/after sheets from docs/world/quality-v3/nature-v4/closeups/{before,after}.
Run: python3 tools/world/camp/nature-v4/compose_compare.py (needs Pillow)."""
import os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
D = os.path.join(REPO, 'docs/world/quality-v3/nature-v4/closeups'); OUT = os.path.join(D, 'compare'); os.makedirs(OUT, exist_ok=True)
for name in sorted(f[:-4] for f in os.listdir(os.path.join(D, 'after')) if f.endswith('.png')):
    a, b = Image.open(os.path.join(D, 'before', name + '.png')), Image.open(os.path.join(D, 'after', name + '.png'))
    sheet = Image.new('RGB', (a.width + b.width + 16, max(a.height, b.height) + 48), (24, 24, 24))
    sheet.paste(a, (0, 48)); sheet.paste(b, (a.width + 16, 48))
    d = ImageDraw.Draw(sheet); d.text((12, 14), f'BEFORE  {name} (pre nature-v4, 1920x1080 raw)', fill=(230, 220, 200)); d.text((a.width + 28, 14), f'AFTER  {name} (nature-v4)', fill=(230, 220, 200))
    sheet.save(os.path.join(OUT, name + '.png')); print('sheet', name)
