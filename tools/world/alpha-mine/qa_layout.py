"""Independent route-height and serialized proxy checks. Does not claim character QA."""
import json, math
from collections import Counter
from pathlib import Path
from layout import OUT, ROUTE, RAMPS, GALLERY_ROUTE, GALLERY_RAMPS, GALLERY_BRIDGES, VEINS, ore_rest
from geometry import build_geometry, collision_data, triangles, cross, sub

def support_at(surface,x,z,expected=None):
    vs=surface['vertices'];hits=[]
    for i in range(0,len(surface['indices']),3):
        p=[vs[3*j:3*j+3] for j in surface['indices'][i:i+3]]
        a,b,c=p;den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
        if abs(den)<1e-10:continue
        u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den
        v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den
        if min(u,v,1-u-v)>=-1e-7:hits.append(u*a[1]+v*b[1]+(1-u-v)*c[1])
    if expected is not None:hits=[h for h in hits if h<=expected+.006]
    return max(hits) if hits else None

def run():
    meshes=build_geometry();data=collision_data();problems=[];rows=[]
    for m in meshes.values():
        edges=Counter();volume=0;degenerate=0
        for f in m.faces:
            for a,b in zip(f,f[1:]+f[:1]):edges[tuple(sorted([a,b]))]+=1
        for t in triangles(m):
            a,b,c=[m.vertices[i] for i in t];n=cross(sub(b,a),sub(c,a))
            degenerate+=sum(v*v for v in n)<1e-16
            cp=cross(b,c);volume+=sum(a[i]*cp[i] for i in range(3))/6
        open_edges=sum(v==1 for v in edges.values());bad=sum(v>2 for v in edges.values())
        row={'name':m.name,'triangles':sum(1 for _ in triangles(m)),'openEdges':open_edges,'nonmanifoldEdges':bad,
             'degenerateTriangles':degenerate,'signedVolumeM3':volume,'semantic':m.semantic}
        rows.append(row)
        if bad or degenerate or (m.semantic not in ['open-walk-surface','open-foliage'] and (open_edges or volume<=0)):problems.append(row)
    probes=[]
    all_segments=list(zip(ROUTE,ROUTE[1:]))+list(zip(GALLERY_ROUTE,GALLERY_ROUTE[1:]))
    for index,(a,b) in enumerate(all_segments):
        n=max(1,math.ceil(math.dist(a,b)/.25))
        for j in range(n+1):
            t=j/n;p=[a[k]+(b[k]-a[k])*t for k in range(3)];actual=support_at(data['surface'],p[0],p[2],p[1])
            if actual is None or abs(actual-p[1])>.006:probes.append({'segment':index,'point':p,'surfaceY':actual})
    for ramp in RAMPS+GALLERY_RAMPS:
        # Check both edges of the stated 2.4m clear lane, not only its centre.
        a,b=ramp['a'],ramp['b']
        for sign in [-1,1]:
            for j in range(25):
                t=j/24;x=a[0]+sign*1.2;z=a[2]+(b[2]-a[2])*t;y=a[1]+(b[1]-a[1])*t
                actual=support_at(data['surface'],x,z)
                if actual is None or abs(actual-y)>.006:probes.append({'ramp':ramp['id'],'edge':sign,'point':[x,y,z],'surfaceY':actual})
    ore_support=[]
    for vein in VEINS:
        rest=ore_rest(vein);samples=[]
        for i in range(9):
            angle=math.tau*i/8;r=.15 if i<8 else 0
            x,z=rest[0]+r*math.cos(angle),rest[2]+r*math.sin(angle)
            y=support_at(data['surface'],x,z);samples.append(y)
            if y is None or abs(y-(vein['level']+.52))>.006:probes.append({'oreSupport':vein['id'],'point':[x,z],'surfaceY':y})
        ore_support.append({'vein':vein['id'],'oreCentre':rest,'footprintRadiusM':.15,'surfaceYs':samples})
    report={'meshes':rows,'geometryProblems':problems,'routeFailures':probes,'oreSupport':ore_support,
            'collisionTriangles':{k:len(v['indices'])//3 for k,v in data.items()},
            'limits':'serialized top-support sampling at 0.25m and ramp lane edges; not a Rapier capsule, animation or full swept-clearance test'}
    folder=Path(__file__).parent/'evidence';folder.mkdir(exist_ok=True)
    (folder/'layout-qa.json').write_text(json.dumps(report,indent=1)+'\n')
    print(json.dumps({'meshes':len(rows),'geometryProblems':len(problems),'routeFailures':len(probes),'collisionTriangles':report['collisionTriangles']}))
    if problems or probes:
        print(json.dumps({'problems':problems[:5],'routeFailures':probes[:5]},indent=1));raise SystemExit(1)

if __name__=='__main__':run()
