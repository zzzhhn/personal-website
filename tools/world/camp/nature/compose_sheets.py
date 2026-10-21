"""Compose raw renders into one contact sheet per asset (system python3 + Pillow)."""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../../..'))
V = os.path.join(REPO, 'docs/world/camp-slice/nature/views')
IDS = sys.argv[1:] or ['G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23']
VIEWS = ['front', 'side', 'back', 'top', 'q34_front', 'q34_back']
LABEL = {'front': 'front (GLB +X)', 'side': 'side (GLB -Z)', 'back': 'back (GLB -X)', 'top': 'top', 'q34_front': '3/4 front', 'q34_back': '3/4 back'}
try:
    man = json.load(open(os.path.join(REPO, 'docs/world/camp-slice/nature/manifest.json')))['assets']
except Exception:
    man = {}
T = 300
for aid in IDS:
    sheet = Image.new('RGB', (T * 6, T * 2 + 34), (235, 232, 226))
    d = ImageDraw.Draw(sheet)
    m = man.get(aid, {})
    d.text((8, 4), f"{aid}  {m.get('title', '')}  GLB size x/y/z {m.get('sizeGLB_xyz_m')} m  tris {m.get('trianglesGLBReimport')}  prims {m.get('drawCallsPrimitives')}   row1 colour EEVEE neutral | row2 clay", fill=(20, 20, 20))
    for r, mode in enumerate(('color', 'clay')):
        for c, v in enumerate(VIEWS):
            im = Image.open(os.path.join(V, 'raw', f'{aid}_{mode}_{v}.png')).convert('RGB').resize((T, T))
            sheet.paste(im, (c * T, 34 + r * T))
            d.text((c * T + 6, 34 + r * T + 6), LABEL[v], fill=(255, 255, 255))
    sheet.save(os.path.join(V, f'{aid}_sheet.png'))
    print('SHEET', aid)
