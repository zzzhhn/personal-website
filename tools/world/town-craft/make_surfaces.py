"""Deterministic authored PBR surfaces, not scans. All tiles are seamless.
One shared texture set per physical family; UV distances are in metres.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/assets/world/town-craft/surfaces'
SIZE = 512

def noise(rng, n):
    a = rng.random((n, n), dtype=np.float32)
    # Wrap the endpoint for genuinely periodic interpolation.
    coords = np.arange(SIZE) / SIZE * n
    i = np.floor(coords).astype(int); f = coords - i; f = f*f*(3-2*f)
    return ((1-f[:,None])*((1-f[None,:])*a[i[:,None],i[None,:]]+f[None,:]*a[i[:,None],(i[None,:]+1)%n])
      + f[:,None]*((1-f[None,:])*a[(i[:,None]+1)%n,i[None,:]]+f[None,:]*a[(i[:,None]+1)%n,(i[None,:]+1)%n]))

def generate(family, seed):
    rng=np.random.default_rng(seed)
    yy,xx=np.mgrid[0:SIZE,0:SIZE]/SIZE
    broad=noise(rng,4); grain=noise(rng,64); fine=rng.random((SIZE,SIZE))
    color=.91+(broad-.5)*.065+(grain-.5)*.055
    height=(grain-.5)*.0005
    rough=.86+(grain-.5)*.10
    if family=='plaster':
        height=(grain-.5)*.00055+(fine-.5)*.00018
        color+= (noise(rng,16)-.5)*.04
    elif family=='stone':
        mineral=noise(rng,128)
        color=.92+(broad-.5)*.025+(mineral-.5)*.022-(fine>.998)*.025
        height=(mineral-.5)*.00024+(fine-.5)*.00010
        rough=.79+(grain-.5)*.055
    elif family in ('wood','bark'):
        warp=.003*np.sin(yy*np.pi*4)+.0015*np.sin(yy*np.pi*10+xx*np.pi*2)
        grainline=np.sin((xx+warp)*np.pi*96+np.sin(yy*np.pi*8))
        late=np.clip((grainline-.30)*1.2,0,1)
        plank=np.floor(xx*6)
        color=.92-late*.06+(broad-.5)*.055+(grain-.5)*.025
        height=-late*.00018+(grain-.5)*.00015
        rough=.66+late*.10+(broad-.5)*.08
        if family=='bark':
            rings=(.5+.5*np.cos(yy*np.pi*20+np.sin(xx*np.pi*4)))**10
            color=.90-rings*.21+(broad-.5)*.12
            height=(grain-.5)*.003-rings*.004
            rough=.94+(grain-.5)*.05
    elif family=='metal':
        brush=np.repeat(rng.random((1,SIZE)),SIZE,axis=0)
        color=.94+(brush-.5)*.025+(broad-.5)*.025
        height=(brush-.5)*.000035
        rough=.43+(broad-.5)*.09+(brush-.5)*.08
    elif family=='roof':
        color=.91+(broad-.5)*.06+(grain-.5)*.07
        height=(grain-.5)*.0013
        rough=.91+(grain-.5)*.07
    elif family=='cloth':
        weave=np.sin(xx*np.pi*256)*np.sin(yy*np.pi*256)
        color=.94+weave*.025+(broad-.5)*.025
        height=weave*.00012
        rough=.9+(grain-.5)*.04
    elif family=='brick':
        # 8 by 24 courses in a 2 m tile: 25 cm by 8.3 cm stretcher bond.
        course=np.floor(yy*24); u=np.mod(xx*8+np.mod(course,2)*.5,1)
        v=np.mod(yy*24,1)
        seam=(np.minimum(u,1-u)<.018)|(np.minimum(v,1-v)<.032)
        tone=noise(rng,12)
        color=.87+(tone-.5)*.18+(grain-.5)*.06
        # Warm mortar variation rather than black grid lines.
        color=np.where(seam,.98,color)
        height=np.where(seam,-.003,(grain-.5)*.001)
        rough=np.where(seam,.95,.82+(grain-.5)*.1)
    elif family=='glazing':
        # Soft curtain/blind transmission proxy, not a live interior reflection.
        # Each pane has its own normalized UV; variation is stable and static.
        edge=np.clip(np.minimum.reduce([xx,1-xx,yy,1-yy])*12,0,1)
        folds=.5+.5*np.cos(xx*np.pi*18+.2*np.sin(yy*np.pi*2))
        blind=(.5+.5*np.cos(yy*np.pi*28))**14
        color=(.40+.16*edge+.06*folds-.006*blind)*(1-.16*yy)
        height=np.zeros_like(xx);rough=.24+.035*folds
    # UV tile represents 2 metres; compute a physical tangent-space normal.
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*SIZE/4
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*SIZE/4
    normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    rgb=np.stack([color,color,color],axis=-1)
    orm=np.stack([np.ones_like(color),np.clip(rough,0,1),np.ones_like(color)],axis=-1)
    OUT.mkdir(parents=True,exist_ok=True)
    for name,data in [('color',rgb),('normal',normal*.5+.5),('orm',orm)]:
        Image.fromarray(np.uint8(np.clip(data,0,1)*255)).save(OUT/f'{family}-{name}.png',optimize=True)

if __name__=='__main__':
    families=['plaster','stone','wood','bark','metal','roof','cloth','brick','glazing']
    for i,f in enumerate(families): generate(f,4107+i)
    (OUT/'provenance.json').write_text(json.dumps({'authorship':'Original deterministic procedural surfaces, not photographic scans','generator':'tools/world/town-craft/make_surfaces.py','resolution':SIZE,'tileMetres':2,'families':families},indent=2)+'\n')
    print(f'{len(families)*3} maps, {sum(p.stat().st_size for p in OUT.glob("*.png"))/1048576:.2f} MiB')
