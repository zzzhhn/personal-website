"""Deterministic authored geometry, entirely in the layout's glTF frame.
No Blender import: collision proxies can ship before native modelling/render work.
"""
import math, json, itertools
from pathlib import Path
from layout import XS, ZS, RAMPS, BRIDGE, POOL, RACK, VEINS, OUT, height, write_contract

MESHES = {}
PROXIES = []
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(v):
    n=math.sqrt(sum(x*x for x in v)); return tuple(x/n for x in v) if n else (0,1,0)
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def mul(a,s): return tuple(x*s for x in a)
def noise(n): return math.sin(n*12.9898+4.3)*.5+.5

class Mesh:
    def __init__(self,name,material,semantic):
        self.name=name;self.material=material;self.semantic=semantic;self.vertices=[];self.faces=[];self.colors=[];self.lookup={}
    def face(self,points,color):
        ids=[]
        for p in points:
            key=tuple(round(v,8) for v in p)
            if key not in self.lookup:self.lookup[key]=len(self.vertices);self.vertices.append(key)
            ids.append(self.lookup[key])
        self.faces.append(ids);self.colors.append(color)

def group(name,material,semantic):
    if name not in MESHES:MESHES[name]=Mesh(name,material,semantic)
    return MESHES[name]

def rock_color(y,seed,x=0,z=0):
    # Broad tilted beds and local fault offsets, not equal-width horizontal stripes.
    section=int((x+17)//6);tilts=[-.13,.18,-.07,.11,-.16,.08]
    layer=y+tilts[section%6]*x+.23*math.sin(z*.28)+[0,.38,-.22,.17,-.34,.1][section%6]
    q=.5+.5*math.sin(layer*.78);rust=math.exp(-((layer%5.9-2.2)/.43)**2)*.20
    a=(126,123,111);b=(178,165,143);ochre=(164,128,81)
    rgb=[(a[k]*(1-q)+b[k]*q)*(1-rust)+ochre[k]*rust for k in range(3)]
    f=.98+.045*noise(seed)
    return '#'+''.join(f'{round(max(0,min(255,c*f))):02x}' for c in rgb)

def warp(p):
    x,y,z=p
    fade=math.sin(math.pi*y/3)
    dx=.065*fade*math.sin(x*.91+z*.67+y*1.8)
    dz=.065*fade*math.sin(x*.73-z*.81+y*1.4)
    if abs(x)>=15.99:
        # Large bays and buttresses alter the actual silhouette, not face noise.
        taper=1.3*math.exp(-((z+7)/6.5)**2)
        dx=-math.copysign(.25+taper+.75*math.sin(z*.19+.8)**2,x)
    if z<=-35.99:dz=0
    if z>=-.01:dz=0
    if abs(x-13.1)<1e-6:dx=.15+.4*math.sin(z*.45)**2
    if abs(x+13.1)<1e-6:dx=-.15-.4*math.sin(z*.42+.5)**2
    if abs(z+21)<1e-6 and -10.5<x<-3.7:
        protect=max(0,min(1,(abs(x+6.4)-.9)/.55));dz=.85*math.sin(x*.9+.4)**2*protect
    if abs(z+25.6)<1e-6 and -13.1<x<-3.7:
        protect=max(0,min(1,(abs(x+8.6)-.9)/.55));dz=.6*math.sin(x*.8)*protect
    if abs(z+33)<1e-6 and -3.7<x<10.5:dz=.85*math.sin(x*.33+.8)**2
    if abs(x+3.7)<1e-6 and -33<z<-25.6:dx=.7*math.sin((z+33)/7.4*math.pi)**2
    if abs(z+35.6)<1e-6:dz=-.06*math.sin(x*.6)**2
    dy=0
    if all(abs(y-level)>.001 for level in [0,3,6]):
        dy=.23*math.sin(x*.61+z*.47)+.11*math.sin(x*1.2-z*.3)
        if y>8.8:dy=-abs(dy)
    return (x+dx,min(9,y+dy),z+dz)

def geology():
    body=group('AM01_rock_mass','stone','closed-rock');ground=group('AM01_ground','ground','open-walk-surface')
    hs={(i,j): round(height((XS[i]+XS[i+1])/2,(ZS[j]+ZS[j+1])/2)/.75)*.75
        for i in range(len(XS)-1) for j in range(len(ZS)-1)}
    levels=[0,.4,.75,1.3,1.5,2.1,2.25,3,3.75,4.5,5.25,6,6.75,7.5,8.25,9]
    for (i,j),h in hs.items():
        x0,x1=XS[i:i+2];z0,z1=ZS[j:j+2]
        top=[(x0,h,z0),(x0,h,z1),(x1,h,z1),(x1,h,z0)]
        if h==0:
            ground.face([warp(p) for p in top], '#A38E6E');continue
        body.face([warp(p) for p in top], rock_color(h,i+j,(x0+x1)/2,(z0+z1)/2))
        body.face([warp(p) for p in [(x1,0,z0),(x1,0,z1),(x0,0,z1),(x0,0,z0)]],'#726B5F')
        sides=[((i,j+1),(0,0,1),lambda y:[(x0,y,z1),(x1,y,z1)]),
               ((i,j-1),(0,0,-1),lambda y:[(x1,y,z0),(x0,y,z0)]),
               ((i+1,j),(1,0,0),lambda y:[(x1,y,z1),(x1,y,z0)]),
               ((i-1,j),(-1,0,0),lambda y:[(x0,y,z0),(x0,y,z1)])]
        for neighbor,n,edge in sides:
            low=hs.get(neighbor,0)
            if low>=h:continue
            cuts=sorted(set([low,h]+[y for y in levels if low<y<h]))
            for k,(lo,hi) in enumerate(zip(cuts,cuts[1:])):
                a,b=edge(lo);d,c=edge(hi);quad=[warp(p) for p in [a,b,c,d]]
                center=tuple(sum(p[q] for p in quad)/4 for q in range(3))
                center=add(center,mul(n,.09*math.sin(i*1.93+j*.83+k*2.1)))
                for t in range(4):body.face([quad[t],quad[(t+1)%4],center],rock_color((lo+hi)/2,i+j+k*.5,center[0],center[2]))

def box(name,center,size,material='wood',color='#8E6E55',semantic='structure',axes=None,collider=True):
    mesh=group(name,material,semantic);mesh.lookup={};u,v,w=axes or ((1,0,0),(0,1,0),(0,0,1))
    vs=[add(center,add(mul(u,(1 if k&1 else -1)*size[0]/2),add(mul(v,(1 if k&2 else -1)*size[1]/2),mul(w,(1 if k&4 else -1)*size[2]/2)))) for k in range(8)]
    for f in [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]:mesh.face([vs[k] for k in f],color)
    if collider:PROXIES.append({'id':name+'-'+str(len(PROXIES)),'shape':'oriented-box','center':list(center),'size':list(size),'axes':[list(u),list(v),list(w)],'kind':'solid','roundingAllowanceM':.012})

def beam(name,a,b,width=.14,depth=None,color='#77583D',collider=True):
    v=unit(sub(b,a));u=unit(cross(v,(0,0,1))) if abs(v[2])<.95 else unit(cross(v,(0,1,0)));w=cross(u,v)
    box(name,mul(add(a,b),.5),(width,math.dist(a,b),depth or width),color=color,axes=(u,v,w),collider=collider)

def deck_points(route):
    a,b=route['a'],route['b'];d=unit((b[0]-a[0],0,b[2]-a[2]));side=(-d[2],0,d[0]);half=route['deckWidth']/2
    return a,b,d,side,half

def walkway(route):
    a,b,d,side,half=deck_points(route);name='AM02_'+route['id'];length=math.dist(a,b);n=math.ceil(length/.27)
    along=unit(sub(b,a));normal=unit(cross(side,along))
    if normal[1]<0:normal=mul(normal,-1)
    for i in range(n):
        t=(i+.5)/n;p=add(a,mul(sub(b,a),t));p=add(p,mul(normal,-.085))
        box(name,p,(route['deckWidth'],.17,length/n-.012),color=['#98764F','#A38158','#8B6A47'][i%3],axes=(side,normal,mul(along,-1)),collider=False)
    for sign in [-1,1]:
        aa=add(a,mul(side,sign*(half-.02)));bb=add(b,mul(side,sign*(half-.02)))
        for up in [.48,1.02]:beam(name+'_rail',add(aa,(0,up,0)),add(bb,(0,up,0)),.085,color='#806044')
        count=math.ceil(length/2.25)
        for i in range(count+1):
            p=add(aa,mul(sub(bb,aa),i/count));beam(name+'_posts',add(p,(0,-.18,0)),add(p,(0,1.1,0)),.13)
    # Continuous support sheet closes the 12mm plank reveals, preserving the exact slope.
    corners=[add(a,mul(side,-half)),add(b,mul(side,-half)),add(b,mul(side,half)),add(a,mul(side,half))]
    if cross(sub(corners[1],corners[0]),sub(corners[2],corners[0]))[1]<0:corners.reverse()
    PROXIES.append({'id':route['id']+'-surface','shape':'trimesh','kind':'surface','vertices':corners,'indices':[0,1,2,0,2,3],'plankRevealM':.012})
    # Posts and braced bents stand on the authored rock or ground, never hang in air.
    for t in [.16,.50,.84]:
        center=add(a,mul(sub(b,a),t));base=height(center[0],center[2])
        if center[1]-base<.3:continue
        left=add(center,mul(side,-.94));right=add(center,mul(side,.94))
        for p in [left,right]:beam(name+'_supports',(p[0],base,p[2]),add(p,(0,-.05,0)),.21)
        beam(name+'_brace',(left[0],base+.15,left[2]),add(right,(0,-.25,0)),.13)
        beam(name+'_brace',(right[0],base+.15,right[2]),add(left,(0,-.25,0)),.13)

def prism(name,poly,y0,y1,color,material='stone',semantic='structure'):
    m=group(name,material,semantic);n=len(poly)
    # XZ CCW rings point down; explicitly orient the top up.
    pts=[(x,y1,z) for x,z in poly]
    if cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]))[1]<0:pts.reverse()
    m.face(pts,color);m.face([(x,y0,z) for x,_,z in reversed(pts)],color)
    for i,p in enumerate(pts):
        q=pts[(i+1)%n]
        m.face([(p[0],y0,p[2]),(q[0],y0,q[2]),q,p],color)

def basin():
    cx,_,cz=POOL['center'];n=26;m=group('AM04_basin_masonry','stone','hollow-basin')
    for i in range(n):
        a=2*math.pi*i/n+.003;b=2*math.pi*(i+1)/n-.003
        ro=3.45+.025*math.sin(i*2.1);ri=2.85+.014*math.sin(i*1.9);top=.62+.022*math.sin(i*.91)
        def p(r,t,y):return(cx+r*math.cos(t),y,cz+r*math.sin(t))
        rings=[]
        for t in [a,(a+b)/2,b]:rings.append([p(ro,t,.015),p(ri,t,.015),p(ri,t,top),p(ro,t,top)])
        color=['#9A907E','#B0A18B','#8C8478','#B9A98F'][i%4]
        for k in range(2):
            for j in range(4):m.face(list(reversed([rings[k][j],rings[k][(j+1)%4],rings[k+1][(j+1)%4],rings[k+1][j]])),color)
        m.face(rings[0],color);m.face(list(reversed(rings[-1])),color)
    floor=group('AM04_basin_floor','stone','basin-floor');rad=2.84
    for i in range(36):
        a=2*math.pi*i/36;b=2*math.pi*(i+1)/36
        p=lambda t,y:(cx+rad*math.cos(t),y,cz+rad*math.sin(t))
        floor.face([(cx,.08,cz),p(b,.08),p(a,.08)],'#858777')
        floor.face([(cx,0,cz),p(a,0),p(b,0)],'#726B5F')
        floor.face([p(a,0),p(a,.08),p(b,.08),p(b,0)],'#726B5F')
    # Drop-position markers are physical rim studs, not a fabricated result curve.
    for dx in [-.8,.8]:box('AM04_drop_studs',(cx+dx,.77,cz+3.18),(.11,.30,.11),'metal','#9C8256')

def rail_line(name,a,b):
    length=math.dist(a,b);n=max(1,math.ceil(length/2.4))
    for i in range(n+1):
        p=add(a,mul(sub(b,a),i/n));beam(name+'_posts',p,add(p,(0,1.10,0)),.15)
    for y in [.43,.99]:beam(name,add(a,(0,y,0)),add(b,(0,y,0)),.095)

def architecture():
    for a,b in [((-15.8,0,-.28),(-4.1,0,-.28)),((4.1,0,-.28),(15.8,0,-.28))]:rail_line('AM03_entry_fence',a,b)
    cx,_,cz=RACK['center']
    for x in [cx-1.25,cx+1.25]:
        beam('AM03_tool_rack',(x,0,cz-.4),(x,2.15,cz),.15)
        beam('AM03_tool_rack',(x,0,cz+.5),(x,2.15,cz),.15)
    for y in [.48,1.75,2.17]:beam('AM03_tool_rack',(cx-1.42,y,cz),(cx+1.42,y,cz),.17)
    for x in [cx-1.0,cx-.5,cx,cx+.5,cx+1.0]:box('AM03_tool_rack',(x,1.17,cz-.06),(.12,1.40,.08),color='#6D513A')
    for x in [cx-.55,cx+.60]:box('AM03_tool_hooks',(x,1.5,cz+.18),(.055,.055,.38),'metal','#625C51',collider=False)
    # A small working shelter and lifting gantry establish the upper silhouette.
    for x in [-10.8,-6.2]:
        for z in [-31.4,-28.8]:beam('AM03_upper_shelter',(x,6,z),(x,8.65,z),.19)
        beam('AM03_upper_shelter',(x,8.60,-31.55),(x,8.60,-28.65),.16)
    for z in [-31.4,-28.8]:beam('AM03_upper_shelter',(-10.95,8.73,z),(-6.05,8.73,z),.16)
    cloth=group('AM03_canvas_roof','canvas','thin-canopy');roof=[]
    for i in range(7):
        x=-11+i*.85;y=8.65-.22*math.sin(math.pi*i/6)
        roof.append([(x,y,-31.625),(x,y,-28.575),(x,y-.025,-31.625),(x,y-.025,-28.575)])
    for i in range(6):
        a,b=roof[i:i+2]
        for points in [[a[0],a[1],b[1],b[0]],[a[2],b[2],b[3],a[3]],
                       [a[0],b[0],b[2],a[2]],[a[1],a[3],b[3],b[1]]]:cloth.face(points,'#D2C4A5')
    cloth.face([roof[0][0],roof[0][2],roof[0][3],roof[0][1]],'#D2C4A5')
    cloth.face([roof[-1][0],roof[-1][1],roof[-1][3],roof[-1][2]],'#D2C4A5')
    beam('AM03_gantry',(-12.0,6,-28.1),(-12.0,9.25,-28.1),.27)
    beam('AM03_gantry',(-12.25,9.18,-28.1),(-8.8,9.18,-28.1),.25)
    beam('AM03_gantry',(-12.0,7.5,-28.1),(-10.25,9.1,-28.1),.20)
    box('AM03_hoist_cable',(-9.05,8.98,-28.1),(.03,.4,.03),'metal','#494940',collider=False)
    for x in [-9.4,-8.7]:
        for z in [-28.45,-27.75]:beam('AM03_hanging_bucket',(x,8.13,z),(x,8.8,z),.10,collider=False)
    for y in [8.15,8.7]:
        for z in [-28.45,-27.75]:beam('AM03_hanging_bucket',(-9.4,y,z),(-8.7,y,z),.075,collider=False)
        for x in [-9.4,-8.7]:beam('AM03_hanging_bucket',(x,y,-28.45),(x,y,-27.75),.075,collider=False)
    box('AM03_hanging_bucket',(-9.05,8.11,-28.1),(.82,.10,.82),collider=False)
    # Mine bays have real low stone seats for short-character ore pickups.
    for v in VEINS:
        x,y,z=v['socket'];poly=[(x+a,z-.05+b) for a,b in [(-.6,-.4),(-.35,-.6),(.48,-.5),(.6,.25),(.35,.55),(-.5,.52)]]
        prism('AM01_ore_catch_'+v['id'],poly,v['level'],v['level']+.52,'#928774')
    # Exposed front platform edges are protected, leaving ramp and bridge joins open.
    rail_line('AM02_west_landing_rail',(-10.3,3,-21),(-3.9,3,-21))
    rail_line('AM02_upper_front_rail',(-3.5,6,-33),(10.3,6,-33))

def triangles(mesh):
    for face in mesh.faces:
        for k in range(1,len(face)-1):yield [face[0],face[k],face[k+1]]

def rock_hull(name,lo,hi,seed):
    """A few broad, asymmetrical fracture solids, never a repeated cone primitive."""
    raw=[]
    for i in range(13):
        y=1-2*(i+.5)/13;r=math.sqrt(1-y*y);a=i*2.399963+seed*.31;s=.72+.4*noise(seed+i*3.7)
        raw.append((math.cos(a)*r*s,y*s,math.sin(a)*r*s))
    mn=[min(p[k] for p in raw) for k in range(3)];mx=[max(p[k] for p in raw) for k in range(3)]
    pts=[tuple(lo[k]+(p[k]-mn[k])/(mx[k]-mn[k])*(hi[k]-lo[k]) for k in range(3)) for p in raw]
    m=group(name,'stone','embedded-fracture')
    for i,j,k in itertools.combinations(range(len(pts)),3):
        a,b,c=pts[i],pts[j],pts[k];n=cross(sub(b,a),sub(c,a))
        values=[sum(n[q]*(p[q]-a[q]) for q in range(3)) for p in pts]
        if max(values)<=1e-8:face=[a,b,c]
        elif min(values)>=-1e-8:face=[a,c,b]
        else:continue
        center=tuple(sum(p[q] for p in face)/3 for q in range(3))
        m.face(face,rock_color(center[1],seed+i*.2,center[0],center[2]))

def route_distance(x,z):
    from layout import ROUTE
    best=1e6
    for a,b in zip(ROUTE,ROUTE[1:]):
        dx=b[0]-a[0];dz=b[2]-a[2];t=max(0,min(1,((x-a[0])*dx+(z-a[2])*dz)/max(dx*dx+dz*dz,1e-8)))
        best=min(best,math.hypot(x-a[0]-t*dx,z-a[2]-t*dz))
    return best

def fractures_and_ground():
    for i,(lo,hi) in enumerate([
        ((-10.1,0,-21.8),(-8.0,2.86,-20.1)),((-5.1,0,-21.9),(-3.3,2.72,-20.1)),
        ((-12.8,3,-26.2),(-10.0,5.88,-24.9)),((-6.9,3,-26.2),(-3.7,5.82,-24.7))]):rock_hull('AM01_primary_fractures',lo,hi,31+i*7)
    for i,(x,width,top) in enumerate([(-11.5,4.1,9),(-6.4,3.4,7.6),(5.4,3.8,7.9),(11.2,4.8,9)]):
        rock_hull('AM01_broken_ridge',(x-width/2,6.25,-36),(x+width/2,top,-35.12),80+i*9)
    # Sparse ground contact details stay outside the protected route and mining stands.
    foliage=group('AM01_crevice_grass','foliage','open-foliage')
    accepted=0
    for i in range(180):
        x=-13+26*noise(i*2.71+7);z=-1-30*noise(i*4.11+23);level=height(x,z)
        if level not in [0,3,6] or route_distance(x,z)<1.45:continue
        if math.hypot(x-POOL['center'][0],z-POOL['center'][2])<3.85:continue
        if any(math.hypot(x-v['stand'][0],z-v['stand'][2])<1.2 for v in VEINS):continue
        if math.hypot(x-RACK['center'][0],z-RACK['center'][2])<2:continue
        if i%3==0:
            sx=.07+.12*noise(i*7);sz=.05+.12*noise(i*5);sy=.04+.10*noise(i*3)
            rock_hull('AM01_ground_spalls',(x-sx,level,z-sz),(x+sx,level+sy,z+sz),i+300)
        else:
            for j in range(11):
                a=j*2.4+i*.7;h=.30+.30*noise(i+j*5);w=.035+.035*noise(i*2+j)
                base=(x+.18*math.cos(a),level+.002,z+.18*math.sin(a));side=(math.cos(a)*w,0,math.sin(a)*w)
                mid=add(base,(math.sin(a)*.10,h*.58,math.cos(a)*.10));tip=add(base,(math.sin(a)*.22,h,math.cos(a)*.22))
                foliage.face([add(base,side),sub(base,side),sub(mid,mul(side,.5)),add(mid,mul(side,.5))],['#697449','#7D8154','#9C9368'][j%3])
                foliage.face([add(mid,mul(side,.5)),sub(mid,mul(side,.5)),tip],['#7B8050','#9A946B'][j%2])
        accepted+=1
        if accepted>=70:break

def build_geometry():
    MESHES.clear();PROXIES.clear();geology()
    for route in RAMPS+[BRIDGE]:walkway(route)
    basin();architecture();fractures_and_ground()
    return MESHES

def collision_data():
    data={'surface':{'vertices':[],'indices':[]},'solid':{'vertices':[],'indices':[]}}
    def append(kind,points):
        target=data[kind];offset=len(target['vertices'])//3
        target['vertices'].extend(round(v,7) for p in points for v in p);target['indices'].extend([offset,offset+1,offset+2])
    for mesh in MESHES.values():
        if mesh.material not in ['stone','ground']:continue
        for tri in triangles(mesh):
            ps=[mesh.vertices[i] for i in tri];n=unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])))
            append('surface' if n[1]>=math.cos(math.radians(25)) else 'solid',ps)
    for p in PROXIES:
        if p['shape']=='trimesh':
            for i in range(0,len(p['indices']),3):append(p['kind'],[p['vertices'][j] for j in p['indices'][i:i+3]])
        else:
            c,s=p['center'],p['size'];u,v,w=p['axes']
            ps=[add(c,add(mul(u,(1 if k&1 else -1)*s[0]/2),add(mul(v,(1 if k&2 else -1)*s[1]/2),mul(w,(1 if k&4 else -1)*s[2]/2)))) for k in range(8)]
            for f in [(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]:
                append('solid',[ps[f[0]],ps[f[1]],ps[f[2]]]);append('solid',[ps[f[0]],ps[f[2]],ps[f[3]]])
    return data

def write_proxies():
    write_contract();build_geometry();data=collision_data()
    (OUT/'colliders.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    evidence=Path(__file__).parent/'evidence';evidence.mkdir(exist_ok=True)
    (evidence/'proxy-parts.json').write_text(json.dumps(PROXIES,indent=1)+'\n')
    return {k:len(v['indices'])//3 for k,v in data.items()}

if __name__=='__main__':print(write_proxies())
