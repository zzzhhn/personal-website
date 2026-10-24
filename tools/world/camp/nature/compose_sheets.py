"""Compose raw renders into one contact sheet per asset (system python3 + Pillow)."""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
V = os.path.join(REPO, 'docs/world/quality-v2/nature/views')
IDS = sys.argv[1:] or ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23']
VIEWS = ['front', 'side', 'back', 'top', 'q34_front', 'q34_back']
LABEL = {'front': 'front (GLB +X)', 'side': 'side (GLB -Z)', 'back': 'back (GLB -X)', 'top': 'top', 'q34_front': '3/4 front', 'q34_back': '3/4 back'}
try:
    man = json.load(open(os.path.join(REPO, 'docs/world/quality-v2/nature/manifest.json')))['assets']
except Exception:
    man = {}
T = 600
for aid in IDS:
    sheet = Image.new('RGB', (T * 3, T * 2 + 48), (235, 232, 226))
    d = ImageDraw.Draw(sheet); m = man.get(aid, {})
    d.text((12, 12), f"{aid}  {m.get('trianglesGLBReimport')} triangles | final Draco GLB | six views, raw 900 px each", fill=(20, 20, 20))
    for n, v in enumerate(VIEWS):
        im = Image.open(os.path.join(V, 'raw', f'{aid}_color_{v}.png')).convert('RGB').resize((T, T))
        x, y = (n % 3) * T, 48 + (n // 3) * T
        sheet.paste(im, (x, y));d.text((x + 8, y + 8), LABEL[v], fill=(20, 20, 20))
    sheet.save(os.path.join(V, f'{aid}_sheet.png'))
    print('SHEET', aid)
