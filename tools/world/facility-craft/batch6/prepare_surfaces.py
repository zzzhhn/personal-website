"""Prepare one shared, neutral grain modulation map from the existing CC0 scan.
This is deterministic material-data processing; no new photographed/generated media.
Run with python3 before the serialized Blender exports.
"""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'tools/world/ibd-crate-craft/textures'
OUT = ROOT / 'public/assets/world/craft-batch6-facilities'


def box_mean(a, radius=24):
    padded = np.pad(a, radius, mode='reflect')
    summed = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    k = radius * 2 + 1
    return (summed[k:, k:] - summed[:-k, k:] - summed[k:, :-k] + summed[:-k, :-k]) / (k * k)


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(SOURCE / 'pine-packaging-basecolor.png').convert('RGB'), dtype=np.float64) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    relative = (linear / np.array([.604, .407, .196])) @ np.array([.2126, .7152, .0722])
    broad = box_mean(relative)
    # Keep photographed fine grain while suppressing the coarse painted bands.
    modulation = 1 + .18 * (broad / np.median(broad) - 1) + .42 * (relative / np.maximum(broad, .01) - 1)
    modulation = np.clip(modulation, .75, 1.20) * .8
    encoded = np.where(modulation <= .0031308, modulation * 12.92, 1.055 * modulation ** (1 / 2.4) - .055)
    pixels = np.repeat(np.rint(encoded[..., None] * 255).astype(np.uint8), 3, axis=2)
    Image.fromarray(pixels).save(OUT / 'wood-color.png')
    for src, dst in [('pine-packaging-normal.png', 'wood-normal.png'), ('pine-packaging-roughness.png', 'wood-rough.png')]:
        shutil.copyfile(SOURCE / src, OUT / dst)
    provenance = json.loads((SOURCE / 'sources.json').read_text())
    provenance['facilityRevision'] = 2
    provenance['runtimeUV'] = {'tileMetres': [.7, .7*466/1024], 'cropPhysicalHeight': '0.7m * 466/1024, independent of resizing to 512px',
        'grainAxis': 'longest construction axis', 'endFaces': 'planar cross-section; no collapsed grain UV', 'textureFlipY': False}
    provenance['facilityAlbedo'] = {'role': 'neutral grain modulation multiplied by source pigment / .8 in both portable PBR and runtime',
        'linearNeutral': .8, 'broadContrast': .18, 'fineContrast': .42, 'clampBeforeNeutral': [.75, 1.2], 'lowPassRadiusPx': 24}
    provenance['facilityFiles'] = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in sorted(OUT.glob('wood-*.png'))}
    (OUT / 'sources.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'revision': 2, 'size': [pixels.shape[1], pixels.shape[0]], 'linearRange': [float(modulation.min()), float(modulation.max())]}))


if __name__ == '__main__':
    prepare()
