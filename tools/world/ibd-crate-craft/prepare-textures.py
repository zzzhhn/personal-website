"""Acquire bounded 1k CC0 photographed pine maps; no browser/Blender launch."""
import hashlib,json,urllib.request
import numpy as np
from PIL import Image
from pathlib import Path
HERE=Path(__file__).resolve().parent
DIR=HERE/'textures';DIR.mkdir(exist_ok=True)
asset='coated_pine';records=[]
for kind in ['diff','nor_gl','rough']:
    url=f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{asset}_{kind}_1k.jpg'
    dest=DIR/f'{asset}_{kind}_1k.jpg'
    if not dest.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=30) as r:dest.write_bytes(r.read(3_000_000))
    records.append(dict(file=dest.name,url=url,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
info=dict(asset='Coated Pine',asset_url='https://polyhaven.com/a/coated_pine',license='CC0',license_url='https://polyhaven.com/license',
  authors=['Charlotte Baglioni (scanning)','Rico Cilliers (processing)'],source_width_m=.7,
  planned_adaptation='Photographed grain and knots retained; albedo neutralized toward approved light packaging timber; matte roughness derived from the scan rather than retaining varnish gloss. Not represented as a raw-pine scan.',files=records)
crop=(0,24,1024,490)
def source_image(kind,mode):
    return Image.open(DIR/f'{asset}_{kind}_1k.jpg').convert(mode).crop(crop).resize((1024,512),Image.Resampling.LANCZOS)
raw=np.asarray(source_image('diff','RGB'),dtype=np.float32)/255
lum=raw@np.array([.2126,.7152,.0722]);gx=float(np.abs(np.diff(lum,axis=1)).mean());gy=float(np.abs(np.diff(lum,axis=0)).mean())
rotate=gx>gy*1.2
if rotate:raw=np.rot90(raw);lum=np.rot90(lum)
# Preserve scanned annual-ring shapes and knots. Remove the coating's broad orange cast.
relative=np.clip(lum/np.median(lum),.43,1.40)**.72
chroma=raw/np.maximum(lum[:,:,None],.08);chroma/=np.median(chroma.reshape(-1,3),axis=0)
derived=np.array([.80,.67,.48])[None,None,:]*relative[:,:,None]*(.87+.13*chroma)
Image.fromarray(np.uint8(np.clip(derived,0,1)*255)).save(DIR/'pine-packaging-basecolor.png')
rough=np.asarray(source_image('rough','L'),dtype=np.float32)/255
if rotate:rough=np.rot90(rough)
rough=np.clip(.79+.11*(rough-np.median(rough)),.71,.88)
Image.fromarray(np.uint8(rough*255)).save(DIR/'pine-packaging-roughness.png')
normal=np.asarray(source_image('nor_gl','RGB'),dtype=np.float32)/255
if rotate:
    normal=np.rot90(normal);nx=normal[:,:,0]*2-1;ny=normal[:,:,1]*2-1
    normal[:,:,0]=ny*.5+.5;normal[:,:,1]=-nx*.5+.5
Image.fromarray(np.uint8(np.clip(normal,0,1)*255)).save(DIR/'pine-packaging-normal.png')
info['derived']=dict(source_crop_xyxy=crop,derived_size=[1024,512],crop_reason='Actual image review: isolate first photographed board between baked source joints; UV across-grain remains inside this strip to avoid painting false joints onto mesh boards.',grain_rotation_ccw_90=rotate,gradient_source_mean=[gx,gy],albedo='Scanned luminance/median clamped .43..1.40, exponent .72; light timber sRGB target [.80,.67,.48], 13 percent source chroma retained.',
 roughness='Scanned relief variation remapped to matte .71..88, median .79; coating gloss intentionally removed.',normal='Original OpenGL normal, vector components rotated consistently with pixels when grain is rotated; runtime strength .22.',
 files=[dict(file=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),bytes=f.stat().st_size) for f in DIR.glob('pine-packaging-*.png')])
(DIR/'sources.json').write_text(json.dumps(info,indent=2));print(json.dumps(dict(files=len(records),bytes=sum(r['bytes'] for r in records),derived=info['derived'])))
