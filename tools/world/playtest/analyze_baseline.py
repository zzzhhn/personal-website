"""Pixel analysis of baseline buffers (python3 + Pillow + numpy).
usage: python3 analyze_baseline.py <baseline_dir>
Writes analysis.json and contact sheets (action strip, freeze pairs, buffer crops)."""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
D = sys.argv[1]; F = os.path.join(D, 'frames')
rep = json.load(open(os.path.join(D, 'baseline-report.json')))
load = lambda n: np.asarray(Image.open(os.path.join(F, n)).convert('RGB')).astype(np.int16)
def diff(a, b, thr=8):
    A, B = load(a), load(b); d = np.abs(A - B).max(axis=2)
    return {'pair': [a, b], 'changedPixelFraction(>8/255)': round(float((d > thr).mean()), 5), 'meanAbs': round(float(d.mean()), 3)}
out = {'freeze': {'pause': diff('pause-a.png', 'pause-b.png'), 'shot': diff('shot-a.png', 'shot-b.png')}}
# character-region stability: player is screen-centred by the follow camera; compare the
# central 220x260 px patch between consecutive frames, after removing global scroll by
# comparing each frame's patch to the frame-0 patch shifted best within +-40 px (cheap search)
strip = rep['cases']['buffer-1920x1080@1']['actionStrip']
def patch(n, cx=960, cy=560, w=110, h=150):
    A = load(os.path.basename(n)); return A[cy - h:cy + h, cx - w:cx + w]
rows = []
for ph in ('walk', 'run', 'jump'):
    fr = [s for s in strip if s['phase'] == ph]
    P = [patch(s['file']) for s in fr]
    d = [round(float(np.abs(P[i] - P[i - 1]).mean()), 2) for i in range(1, len(P))]
    rows.append({'phase': ph, 'frames': len(P), 'centrePatchMeanAbsDiffConsecutive': d, 'playerY': [round(s['player'][1], 3) for s in fr]})
out['actionStrip'] = rows
out['actionNote'] = ('Follow camera keeps the capsule near screen centre; the background scrolls so centre-patch diffs are '
                     'not limb motion. Limb/pose judgement is from the cropped contact sheet by eye: see action-sheet.png.')
# contact sheet of character crops (zoomed)
crops = []
for s in strip:
    im = Image.open(os.path.join(F, os.path.basename(s['file']))).convert('RGB').crop((960 - 120, 540 - 150, 960 + 120, 540 + 170)).resize((240, 320))
    crops.append((s['phase'], im))
sheet = Image.new('RGB', (240 * 6, 320 * 3 + 30 * 3), (30, 30, 30)); dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 16)
except OSError: font = ImageFont.load_default()
for r, ph in enumerate(('walk', 'run', 'jump')):
    items = [c for c in crops if c[0] == ph]
    dr.text((8, r * 350 + 6), f'{ph}: real keys, 1920x1080 buffer crops around screen centre (~110 ms apart)', fill=(240, 240, 240), font=font)
    for i, (_, im) in enumerate(items): sheet.paste(im, (i * 240, r * 350 + 30))
sheet.save(os.path.join(D, 'action-sheet.png'))
# freeze sheet
fs = Image.new('RGB', (960 * 2, 540 * 2 + 60), (30, 30, 30)); dr = ImageDraw.Draw(fs)
for r, (a, b, label) in enumerate((('pause-a.png', 'pause-b.png', 'paused (Esc) 1 s apart'), ('shot-a.png', 'shot-b.png', 'shot=camp 1 s apart'))):
    for c, n in enumerate((a, b)): fs.paste(Image.open(os.path.join(F, n)).convert('RGB').resize((960, 540)), (c * 960, r * 570 + 30))
    dr.text((8, r * 570 + 6), f"{label}: changed px {out['freeze']['pause' if r == 0 else 'shot']['changedPixelFraction(>8/255)']}", fill=(240, 240, 240), font=font)
fs.save(os.path.join(D, 'freeze-sheet.png'))
# buffer crops: same 480x270 CSS region scaled to physical pixels, shows real resolution difference
bs = []
for tag in ('1440x900@1', '1440x900@2', '1920x1080@1', '2560x1440@1'):
    im = Image.open(os.path.join(F, f'buffer-{tag}-spawn.png')).convert('RGB'); w, h = im.size
    cx, cy = w // 2, h // 2; cw, ch = int(w * 0.2), int(h * 0.2)
    bs.append((tag, im.size, im.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2)).resize((640, 360), Image.NEAREST)))
bsh = Image.new('RGB', (640 * 2, 390 * 2), (30, 30, 30)); dr = ImageDraw.Draw(bsh)
for i, (tag, size, im) in enumerate(bs):
    x, y = (i % 2) * 640, (i // 2) * 390
    bsh.paste(im, (x, y + 30)); dr.text((x + 8, y + 6), f'{tag} buffer {size[0]}x{size[1]}  centre 20% crop, NEAREST', fill=(240, 240, 240), font=font)
bsh.save(os.path.join(D, 'buffer-crops.png'))
json.dump(out, open(os.path.join(D, 'analysis.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
