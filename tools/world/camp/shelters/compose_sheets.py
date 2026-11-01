"""Compose 3x2 contact sheets from render_views output. python3 compose_sheets.py VIEWDIR C03 [C04 ...]"""
import glob, os, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
for aid in sys.argv[2:]:
    for suffix in ('', '_clay'):
        files = sorted(glob.glob(os.path.join(d, f'{aid}{suffix}', f'{aid}_*.png')))
        if len(files) != 6:
            continue
        ims = [Image.open(f).convert('RGB') for f in files]
        w, h = ims[0].size
        sheet = Image.new('RGB', (w * 3, h * 2 + 28), (30, 30, 32))
        dr = ImageDraw.Draw(sheet)
        src_file = os.path.join(d, f'{aid}{suffix}', 'source.txt')
        src = open(src_file).read().strip() if os.path.exists(src_file) else 'source=native .blend (not GLB)'
        dr.text((8, 6), f'{aid}{suffix}  front=+X  {src}  | neutral light, floor/camera/light are presentation only', fill=(230, 230, 230))
        for i, (im, f) in enumerate(zip(ims, files)):
            x, y = (i % 3) * w, (i // 3) * h + 28
            sheet.paste(im, (x, y))
            dr.text((x + 6, y + 4), os.path.basename(f)[len(aid) + 1:-4], fill=(20, 20, 20))
        sheet.save(os.path.join(d, f'{aid}{suffix}_sheet.png'))
        print('SHEET', aid, suffix)
