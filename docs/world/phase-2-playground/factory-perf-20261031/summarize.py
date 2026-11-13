"""Summarize raw per-render rows. FPS excludes the first interval; percentiles are nearest rank."""
from pathlib import Path
import sys,json,math
from statistics import median
for path in sorted(Path(__file__).parent.glob('*.json')):
    data=json.loads(path.read_text()); rows=data.get('samples',[])
    if not rows:continue
    def values(key):return sorted(x[key] for x in rows if x[key] is not None)
    dt=values('dt'); gpu=values('gpu')
    p=lambda a,q:round(a[math.ceil(q*len(a))-1],2) if a else None
    out=dict(frames=len(rows),fps=round(1000*len(dt)/sum(dt),2),p50=p(dt,.5),p95=p(dt,.95),pre=p(values('pre'),.5),submit=p(values('submit'),.5),gpuSamples=len(gpu),gpuP50=p(gpu,.5),draws=p(values('draws'),.5),tri=p(values('tri'),.5))
    z=[sum(v[1] for v in r['rays'].values()) for r in rows];out['factoryRayMsP50']=round(median(z),2)
    print(path.stem,out)
