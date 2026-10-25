"""Deterministic authored geometry, entirely in the layout's glTF frame.
No Blender import: collision proxies can ship before native modelling/render work.
"""
import math, json, itertools
from pathlib import Path
from layout import XS, ZS, RAMPS, BRIDGE, ROUTE, GALLERY_RAMPS, GALLERY_BRIDGES, GALLERY_ROUTE, LOW_EXITS, LOW_PASSAGES, LAMPS, POOL, RACK, VEINS, OUT, height, write_contract, perimeter_map, rock_intervals, smooth, outline

MESHES = {}
PROXIES = []
VEGETATION = []
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
    layer=y+.10*x+.045*z+.30*math.sin(x*.19+z*.11)+.14*math.sin(x*.42-z*.15)
    q=.5+.5*math.sin(layer*.78);rust=math.exp(-((layer%5.9-2.2)/.43)**2)*.17
    a=(131,134,123);b=(183,171,148);ochre=(170,140,96)
    rgb=[(a[k]*(1-q)+b[k]*q)*(1-rust)+ochre[k]*rust for k in range(3)]
    teal=math.exp(-((layer%6.9-4.1)/.24)**2)*.16
    rgb=[rgb[k]*(1-teal)+(72,112,101)[k]*teal for k in range(3)]
    f=.985+.03*noise(seed)
    return '#'+''.join(f'{round(max(0,min(255,c*f))):02x}' for c in rgb)

def warp(p):
    x,y,z=p
    fade=math.sin(math.pi*y/3);protect=rock_protection(x,z)
    dx=.32*fade*math.sin(x*.49+z*.23+y*.57)*protect
    dz=.36*fade*math.sin(x*.31-z*.29+y*.67)*protect
    if z<=-35.99:dz=0
    if z>=-.01:dz=0
    if abs(x-13.1)<1e-6:dx=.25+.8*math.sin(z*.22+.4)**2
    if abs(x+13.1)<1e-6:dx=-.25-.8*math.sin(z*.20+.5)**2
    if abs(z+21)<1e-6 and -10.5<x<-3.7:
        protect=max(0,min(1,(abs(x+6.4)-.9)/.55));dz=.85*math.sin(x*.9+.4)**2*protect
    if abs(z+25.6)<1e-6 and -13.1<x<-3.7:
        protect=max(0,min(1,(abs(x+8.6)-.9)/.55));dz=.6*math.sin(x*.8)*protect
    if abs(z+33)<1e-6 and -3.7<x<10.5:dz=.85*math.sin(x*.33+.8)**2
    if abs(x+3.7)<1e-6 and -33<z<-25.6:dx=.7*math.sin((z+33)/7.4*math.pi)**2
    if abs(z+35.6)<1e-6:dz=-(.3+.65*math.sin(x*.32)**2)*max(0,min(1,(abs(x-1.5)-1.0)/.8))
    dy=0
    if all(abs(y-level)>.001 for level in [0,3,6]):
        dy=.23*math.sin(x*.61+z*.47)+.11*math.sin(x*1.2-z*.3)
        if y>8.8:dy=-abs(dy)
    if (abs(x)>=21 or z<=-48) and y>6:
        dy=(y-6)/3*(.65*math.sin(x*.23+z*.14)+.40*math.sin(x*.50-z*.11))
    # An actual eroded rock foot, not a tall wall cut at a rectangular domain.
    # Raised routes stay fixed; distant crests descend into the host mainland.
    edge=min(x+24,24-x,z+52,2-z)
    foot=smooth(3.1,4.0,route_distance(x,z))*(1-smooth(0,5,edge))
    yy=(y+dy)*(1-.994*foot)-.12*foot
    px,pz=perimeter_map(x,z)
    return (px+dx,min(12,yy),pz+dz)

def rock_protection(x,z):
    """Keep authored vein faces and walking joins exact while shaping adjacent rock."""
    near=min(math.hypot(x-v['socket'][0],z-v['socket'][2]) for v in VEINS)
    lane=.28+.72*max(0,min(1,(route_distance(x,z)-1.35)/.9))
    return max(0,min(1,(near-1.25)/.75))*lane

def fracture_skin(edge,low,high,n,seed):
    """A closed attached skin of offset fracture planes, not stacked loose boulders.
    The back is embedded in the original rock mass; all fronts generate collision.
    """
    a,b=edge(low);width=math.dist(a,b);nu=max(1,math.ceil(width/1.40));nv=max(2,math.ceil((high-low)/1.50))
    m=group('AM01_connected_fracture_skin','stone','closed-fracture-skin');m.lookup={}
    grids=[]
    for front in [True,False]:
        grid=[]
        for j in range(nv+1):
            row=[];t=j/nv
            for i in range(nu+1):
                s=i/nu;x=a[0]+(b[0]-a[0])*s;z=a[2]+(b[2]-a[2])*s;y=low+(high-low)*t
                protection=rock_protection(x,z)
                if front:
                    # Slanted fracture joints dislocate across adjoining structural bays.
                    y+=math.sin(math.pi*t)*(.23*math.sin(x*.64+z*.47)+.12*math.sin(x*1.23-z*.58))
                    if j==nv and (high>6.1 or route_distance(x,z)>2.6):
                        y+=protection*(.09+.38*noise(x*3.7+z*.4))
                    d=protection*(.055+.24*math.sin(x*1.2+z*.72+y*.83)**2+.10*abs(math.sin(x*.37-z*.91-y*1.41)))
                else:d=-.095
                row.append(add(warp((x,y,z)),mul(n,d)))
            grid.append(row)
        grids.append(grid)
    front,back=grids
    for j in range(nv):
        for i in range(nu):
            ps=[front[j][i],front[j][i+1],front[j+1][i+1],front[j+1][i]]
            # Offset fracture centres make oblique planes and chipped edges legible.
            center=tuple(sum(p[k] for p in ps)/4 for k in range(3));protect=rock_protection(center[0],center[2])
            center=add(center,mul(n,protect*(.035+.13*noise(seed+i*3.1+j*7.7))))
            for k in range(4):m.face([ps[k],ps[(k+1)%4],center],rock_color(center[1],seed+i*9+j*3+k,center[0],center[2]))
            m.face([back[j][i],back[j+1][i],back[j+1][i+1],back[j][i+1]],rock_color(center[1],seed,center[0],center[2]))
    for j in range(nv):
        for i,reverse in [(0,False),(nu,True)]:
            ps=[front[j][i],front[j+1][i],back[j+1][i],back[j][i]]
            m.face(list(reversed(ps)) if reverse else ps,rock_color(low+j,seed))
    for i in range(nu):
        m.face([front[0][i],back[0][i],back[0][i+1],front[0][i+1]],rock_color(low,seed))
        m.face([front[nv][i],front[nv][i+1],back[nv][i+1],back[nv][i]],rock_color(high,seed))

def attached_talus(edge,low,high,n,seed):
    if high-low<2 or low not in [0,3,6]:return
    a,b=edge(low);length=math.dist(a,b);count=max(1,math.ceil(length/.95))
    m=group('AM01_attached_talus','stone','closed-talus')
    for i in range(count):
        mid=add(a,mul(sub(b,a),(i+.5)/count))
        if floor_route_distance(mid[0],low,mid[2])<1.6:continue
        if any(abs(low-v['level'])<.5 and math.hypot(mid[0]-v['socket'][0],mid[2]-v['socket'][2])<1.4 for v in VEINS):continue
        rings=[]
        for t in [i/count,(i+1)/count]:
            p=add(a,mul(sub(b,a),t));p=warp(p)
            reach=.45+.42*noise(seed+t*13);rise=.24+.45*noise(seed+t*19)
            rings.append([add(p,mul(n,.02)),add(p,mul(n,reach)),add(add(p,mul(n,.035)),(0,rise,0))])
        ps=rings[0]+rings[1];center=tuple(sum(p[k] for p in ps)/6 for k in range(3));m.lookup={}
        for f in [(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)]:
            # Preserve shared-edge winding on warped nonplanar wedge faces.
            face=[ps[k] for k in f]
            m.face(face,rock_color(low+.2,seed+i,mid[0],mid[2]))

def ground_field(x,z):
    # Union of an eroded forecourt, its cliff-bound interior and the west access.
    fore=(x/14.5)**2+((z+10)/11.6)**2-1+.045*math.sin(x*.9+z*.6)+.025*math.sin(x*2+z)
    pit=max(abs(x)-13.05,z+17,-z-35)/10
    west=((x+19)/2.3)**2+((z+6)/7)**2-1
    near_lower=math.hypot(x-VEINS[0]['stand'][0],z-VEINS[0]['stand'][2])/1.6-1
    approach=100
    for a,b in [pair for route in [ROUTE,*LOW_EXITS.values()] for pair in zip(route,route[1:])]:
        if a[1]!=0 or b[1]!=0:continue
        dx=b[0]-a[0];dz=b[2]-a[2];t=max(0,min(1,((x-a[0])*dx+(z-a[2])*dz)/max(dx*dx+dz*dz,1e-8)))
        approach=min(approach,math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)/1.5-1)
    return min(fore,pit,west,near_lower,approach)

def eroded_ground(mesh,x0,x1,z0,z1):
    """Clip sub-triangles to a continuous irregular outline at exactly y=0."""
    def cuts(lo,hi):return [lo]+[float(k) for k in range(math.floor(lo)+1,math.ceil(hi)) if lo+1e-7<k<hi-1e-7]+[hi]
    xx=cuts(x0,x1);zz=cuts(z0,z1)
    for a,b in zip(xx,xx[1:]):
        for c,d in zip(zz,zz[1:]):
            for tri in [[(a,0,c),(a,0,d),(b,0,d)],[(a,0,c),(b,0,d),(b,0,c)]]:
                result=[]
                for p,q in zip(tri,tri[1:]+tri[:1]):
                    fp=ground_field(p[0],p[2]);fq=ground_field(q[0],q[2])
                    if fp<=0:result.append(p)
                    if (fp<=0)!=(fq<=0):
                        t=fp/(fp-fq);result.append(tuple(p[k]+(q[k]-p[k])*t for k in range(3)))
                clean=[]
                for p in result:
                    q=tuple(round(k,8) for k in p)
                    if q not in clean:clean.append(q)
                result=clean
                if len(result)>=3:
                    tapered=[]
                    for p in result:
                        f=ground_field(p[0],p[2]);fade=max(0,min(1,(f+.12)/.12))
                        safe=route_distance(p[0],p[2])>1.8 and math.hypot(p[0]-POOL['center'][0],p[2]-POOL['center'][2])>4
                        safe=safe and math.hypot(p[0]-RACK['center'][0],p[2]-RACK['center'][2])>2 and rock_protection(p[0],p[2])>.9
                        tapered.append((p[0],-.13*fade*fade if safe else 0,p[2]))
                    for j in range(1,len(tapered)-1):
                        tri=[tapered[0],tapered[j],tapered[j+1]]
                        if sum(v*v for v in cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])))>1e-15:
                            mesh.face(tri,['#A08C6F','#A18D70','#A28F72'][int(abs(a*13+c*7))%3])

def geology():
    body=group('AM01_rock_mass','stone','closed-rock');ground=group('AM01_ground','ground','open-walk-surface')
    cells={(i,j): rock_intervals((XS[i]+XS[i+1])/2,(ZS[j]+ZS[j+1])/2)
        for i in range(len(XS)-1) for j in range(len(ZS)-1)}
    levels=[0,.4,.75,1.3,1.5,2.1,2.25,2.7,3,3.75,4.5,5.25,6,6.75,7.5,8.25,9,9.75,10.5,11.25,12]
    for (i,j),intervals in cells.items():
        x0,x1=XS[i:i+2];z0,z1=ZS[j:j+2]
        h=intervals[-1][1] if intervals else 0
        top=[(x0,h,z0),(x0,h,z1),(x1,h,z1),(x1,h,z0)]
        if h==0 or intervals[0][0]>0:
            # Open dirt follows the forecourt and western access, avoiding a square tile
            # boundary across the host mainland. The island provides surrounding soil.
            eroded_ground(ground,x0,x1,z0,z1)
        if not intervals:continue
        bottom=intervals[0][0]
        body.face([warp(p) for p in top], rock_color(h,i+j,(x0+x1)/2,(z0+z1)/2))
        body.face([warp(p) for p in [(x1,bottom,z0),(x1,bottom,z1),(x0,bottom,z1),(x0,bottom,z0)]],'#726B5F')
        sides=[((i,j+1),(0,0,1),lambda y:[(x0,y,z1),(x1,y,z1)]),
               ((i,j-1),(0,0,-1),lambda y:[(x1,y,z0),(x0,y,z0)]),
               ((i+1,j),(1,0,0),lambda y:[(x1,y,z1),(x1,y,z0)]),
               ((i-1,j),(-1,0,0),lambda y:[(x0,y,z0),(x0,y,z1)])]
        for neighbor,n,edge in sides:
            other=cells.get(neighbor,[])
            cuts=sorted(set([bottom,h]+[y for interval in other for y in interval if bottom<y<h]+[y for y in levels if bottom<y<h]))
            for k,(lo,hi) in enumerate(zip(cuts,cuts[1:])):
                if any(a<(lo+hi)/2<b for a,b in other):continue
                a,b=edge(lo);d,c=edge(hi);quad=[warp(p) for p in [a,b,c,d]]
                center=tuple(sum(p[q] for p in quad)/4 for q in range(3))
                # One continuous closed shell. No independently capped wall overlays.
                center=add(center,mul(n,.42*surface_relief(*center)*math.sin(center[0]*.7+center[2]*.4+center[1])**2))
                for t in range(4):body.face([quad[t],quad[(t+1)%4],center],rock_color((lo+hi)/2,i+j+k*.5,center[0],center[2]))
            if not other:attached_talus(edge,bottom,h,n,100+i*37+j*11)

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
        inset=route.get('railInset',0)
        aa=add(aa,mul(along,inset));bb=sub(bb,mul(along,inset))
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
    for a,b in [pair for route in [ROUTE,GALLERY_ROUTE,*LOW_EXITS.values()] for pair in zip(route,route[1:])]:
        dx=b[0]-a[0];dz=b[2]-a[2];t=max(0,min(1,((x-a[0])*dx+(z-a[2])*dz)/max(dx*dx+dz*dz,1e-8)))
        best=min(best,math.hypot(x-a[0]-t*dx,z-a[2]-t*dz))
    return best

def floor_route_distance(x,y,z):
    best=1e6
    for a,b in [pair for route in [ROUTE,GALLERY_ROUTE,*LOW_EXITS.values()] for pair in zip(route,route[1:])]:
        d=sub(b,a);t=max(0,min(1,sum((p-q)*v for p,q,v in zip((x,y,z),a,d))/max(sum(v*v for v in d),1e-8)))
        closest=add(a,mul(d,t));best=min(best,math.dist((x,y,z),closest))
    return best

def surface_relief(x,y,z):
    clearance=1e6
    for a,b in [pair for route in [ROUTE,GALLERY_ROUTE,*LOW_EXITS.values()] for pair in zip(route,route[1:])]:
        dx,dz=b[0]-a[0],b[2]-a[2];t=max(0,min(1,((x-a[0])*dx+(z-a[2])*dz)/max(dx*dx+dz*dz,1e-8)))
        cx,cy,cz=add(a,mul(sub(b,a),t));dy=max(0,abs(y-(cy+.88))-.48)
        clearance=min(clearance,math.sqrt((x-cx)**2+dy*dy+(z-cz)**2)-.34)
    near=min(math.hypot(x-v['socket'][0],z-v['socket'][2]) for v in VEINS)
    return smooth(.4,.9,clearance)*smooth(1.1,2,near)

def fractures_and_ground():
    for i,(lo,hi) in enumerate([
        ((-10.1,0,-21.8),(-8.0,2.86,-20.1)),((-5.1,0,-21.9),(-3.3,2.72,-20.1)),
        ((-12.8,3,-26.2),(-10.0,5.88,-24.9)),((-6.9,3,-26.2),(-3.7,5.82,-24.7))]):rock_hull('AM01_primary_fractures',lo,hi,31+i*7)
    for i,(x,width,top) in enumerate([(-11.5,4.1,9),(-6.4,3.4,7.6),(5.4,3.8,7.9),(12.0,2.4,9)]):
        rock_hull('AM01_broken_ridge',(x-width/2,6.25,-36),(x+width/2,top,-35.12),80+i*9)
    # Sparse ground contact details stay outside the protected route and mining stands.
    accepted=0
    for i in range(650):
        x=-22+44*noise(i*2.71+7);z=1-50*noise(i*4.11+23);level=height(x,z)
        if level not in [0,3,6] or route_distance(x,z)<1.45:continue
        if level==0 and ground_field(x,z)>-.12:continue
        if math.hypot(x-POOL['center'][0],z-POOL['center'][2])<3.85:continue
        if any(math.hypot(x-v['stand'][0],z-v['stand'][2])<1.2 for v in VEINS):continue
        if math.hypot(x-RACK['center'][0],z-RACK['center'][2])<2:continue
        if i%3==0:
            sx=.07+.12*noise(i*7);sz=.05+.12*noise(i*5);sy=.04+.10*noise(i*3)
            rock_hull('AM01_ground_spalls',(x-sx,level,z-sz),(x+sx,level+sy,z+sz),i+300)
        else:
            VEGETATION.append({'position':[round(x,3),level+.015,round(z,3)],'scale':round(.7+.6*noise(i*5),3),'yaw':round(noise(i*7)*math.tau,3)})
        accepted+=1
        if accepted>=140:break
    # The fringe grows on the host ground, outside the eroded stone foot. Its
    # roots sit 14cm below the quarry datum, matching mainland y=1 rather than
    # hovering at the raised facility plane. No static grass is exported.
    boundary=outline()
    for i,(a,b) in enumerate(zip(boundary,boundary[1:]+boundary[:1])):
        if noise(i*5.73)<.72:continue
        dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
        # A few irregular patches, with real empty stretches between them.
        for j in range(3+int(4*noise(i*3.9))):
            t=.2+.6*noise(i*13+j*2.1);offset=.25+1.05*noise(i*7+j)
            x=a[0]+dx*t+dz/length*offset;z=a[1]+dz*t-dx/length*offset
            spread=(noise(i*2+j*11)-.5)*1.7;x+=dx/length*spread;z+=dz/length*spread
            if route_distance(x,z)<1.6:continue
            VEGETATION.append({'position':[round(x,3),-.13,round(z,3)],'scale':round(.8+.45*noise(i+j*3),3),'yaw':round(noise(i+j*13)*math.tau,3)})

def cylinder(name,a,b,radius,material='metal',color='#554C3D',n=10):
    axis=unit(sub(b,a));u=unit(cross(axis,(0,0,1))) if abs(axis[2])<.95 else unit(cross(axis,(0,1,0)))
    w=cross(u,axis);m=group(name,material,'closed-detail');m.lookup={}
    rings=[[add(p,add(mul(u,radius*math.cos(i*math.tau/n)),mul(w,radius*math.sin(i*math.tau/n)))) for i in range(n)] for p in [a,b]]
    m.face(rings[0],color);m.face(list(reversed(rings[1])),color)
    for i in range(n):m.face([rings[0][i],rings[1][i],rings[1][(i+1)%n],rings[0][(i+1)%n]],color)

def crate(x,y,z,size=1):
    # Separate slats, raised corner battens, iron nails and diagonal face brace.
    box('AM05_crates',(x,y+size*.45,z),(size,.9*size,size),color='#79583B')
    for k in range(5):
        q=(k-2)*size*.18
        for sign in [-1,1]:
            box('AM05_crate_slats',(x+q,y+size*.46,z+sign*size*.511),(size*.165,size*.82,.035),color=['#AA7C49','#9B6E42','#B58A59'][k%3],collider=False)
        box('AM05_crate_lid',(x+q,y+size*.914,z),(size*.165,.035,size),color='#A37B4C',collider=False)
    for dx in [-.43,.43]:
        for dz in [-.53,.53]:box('AM05_crate_battens',(x+dx*size,y+size*.46,z+dz*size),(.10*size,.98*size,.07*size),color='#BD9562',collider=False)
    beam('AM05_crate_diagonal',(x-size*.4,y+.11*size,z+.555*size),(x+size*.4,y+.82*size,z+.555*size),.085*size,color='#C09B6A',collider=False)
    for dx in [-.43,.43]:
        for dy in [.12,.78]:cylinder('AM05_iron_nails',(x+dx*size,y+dy*size,z+.57*size),(x+dx*size,y+dy*size,z+.585*size),.018*size,n=6)

def lantern(p):
    x,y,z=p
    beam('AM05_lamp_posts',(x, max(0,y-2.65),z-.24),(x,y+.45,z-.24),.15)
    beam('AM05_lamp_brackets',(x,y+.35,z-.24),(x,y+.35,z+.12),.095)
    cylinder('AM05_lamp_hook',(x,y+.18,z),(x,y+.35,z),.025)
    box('AM05_lamp_glass',(x,y,z),(.22,.36,.22),'glow','#FFC46D',collider=False)
    for dy in [-.21,.21]:box('AM05_lamp_housing',(x,y+dy,z),(.32,.07,.32),'metal','#5A4E3B',collider=False)
    for dx in [-.13,.13]:
        for dz in [-.13,.13]:beam('AM05_lamp_cage',(x+dx,y-.19,z+dz),(x+dx,y+.19,z+dz),.026,color='#57452F',collider=False)

def mine_cart(x,y,z):
    for dz in [-.60,.60]:
        cylinder('AM05_cart_axles',(x-.8,y+.34,z+dz),(x+.8,y+.34,z+dz),.06)
        for sign in [-1,1]:
            cylinder('AM05_cart_wheels',(x+sign*.64,y+.34,z+dz),(x+sign*.78,y+.34,z+dz),.29,color='#454B48',n=14)
            cylinder('AM05_cart_hubs',(x+sign*.78,y+.34,z+dz),(x+sign*.81,y+.34,z+dz),.10,color='#A08657',n=10)
    box('AM05_cart_base',(x,y+.55,z),(1.55,.18,1.80),color='#705238')
    for dy in [.77,1.05,1.33]:
        for sign in [-1,1]:
            box('AM05_cart_sides',(x+sign*.72,y+dy,z),(.12,.25,1.8),color='#92704C')
            box('AM05_cart_ends',(x,y+dy,z+sign*.84),(1.44,.25,.12),color='#A17D50')
    for dx in [-.71,.71]:
        for dz in [-.83,.83]:box('AM05_cart_iron',(x+dx,y+1.05,z+dz),(.09,1.0,.09),'metal','#4D5147',collider=False)
    for i in range(6):
        qx=x-.55+1.1*noise(i*3);qz=z-.6+1.2*noise(i*7)
        rock_hull('AM05_cart_ore',(qx-.3,y+.62,qz-.3),(qx+.3,y+1.50+.25*noise(i),qz+.3),700+i)

def scenic_galleries():
    # The ridge now belongs to the closed landscape shell; no floating crown pile.
    # Large irregular facing plates break the long grid walls into readable fractures.
    for i,(z,base,top) in enumerate([(-14.8,.4,4.3),(-19.5,0,6.7),(-24.8,1.1,8.9),(-29.8,3,9.1)]):
        rock_hull('AM06_east_buttresses',(13.36,base,z-2.1),(16.6,top-.25,z+1.8),1900+i*7)
        rock_hull('AM06_east_crown',(14.5,top-.8,z-1.5),(16.7,top+.35,z+1.5),1930+i*7)
    for i,(x,z) in enumerate([(-11.8,-37),(-5.2,-37.2),(3.4,-37.1)]):
        rock_hull('AM06_rear_face_plates',(x-1.5,6.15,z-.9),(x+1.7,9.2+.8*noise(i),z+.65),1970+i*7)
    # Actual roofed tunnel. Closed side buttresses and segmented roof over a clear void.
    for i in range(4):
        x=-17.1+i*1.8
        rock_hull('AM06_cave_south',(x,6,-41.1),(x+1.85,10.6+.4*noise(i),-39.3),1200+i*4)
        rock_hull('AM06_cave_north',(x,6,-46.8),(x+1.85,11.4,-44.9),1300+i*4)
        # A solid irregular lintel stays entirely above the 3.2m clear headroom.
        rock_hull('AM06_cave_roof',(x-.35,9.45,-46.2),(x+2.25,11.9,-39.9),1400+i*3)
    for x in [-17.2,-13.6,-9.7]:
        for z in [-44.75,-41.25]:
            beam('AM06_cave_timber',(x,6,z),(x,9.36,z),.26,color='#61472F')
            beam('AM06_cave_braces',(x,8.48,z),(x,9.25,z+(.67 if z<-43 else -.67)),.17,color='#7B5936')
        beam('AM06_cave_lintel',(x,9.30,-44.95),(x,9.30,-41.05),.30,color='#8A653E')
        for z in [-44.75,-41.25]:
            box('AM06_cave_iron_bands',(x,8.67,z),(.29,.12,.29),'metal','#635F48',collider=False)
    for z in [-44.5,-41.5]:beam('AM06_cave_longitudinal',(-17.2,9.36,z),(-9.7,9.36,z),.18,color='#694B30')
    # Raised gallery guardrails leave route entry/exit and bridge landing gates open.
    rail_line('AM06_west_gallery_rail',(-20.8,3,-15),(-20.8,3,-28.5))
    rail_line('AM06_north_gallery_rail',(8.0,6,-46.1),(19.8,6,-46.1))
    rail_line('AM06_east_gallery_rail',(19.8,6,-46.1),(19.8,6,-37.2))
    # Two short freight tracks and an ore cart tell how this place works.
    for x,z,y,length in [(12.6,-40.7,6,4.8),(-3.8,-12.2,0,5.2)]:
        for sign in [-1,1]:box('AM05_freight_rails',(x+sign*.56,y+.07,z),(.085,.12,length),'metal','#625E4E',collider=False)
        for i in range(math.ceil(length/.55)):
            box('AM05_rail_sleepers',(x,y+.025,z-length/2+i*.55),(1.55,.05,.15),color='#765B3B',collider=False)
    mine_cart(12.6,6,-40.7)
    # Workbench, stacked crates and stone sample trays are outside protected lanes.
    for x,y,z,s in [(-3.0,0,-18.6,1.0),(-2.0,0,-19.0,.65),(-13,0,-5.7,.95),
                    (9.2,3,-18.8,.70),(-6.1,6,-31.7,.8),(-6.2,6,-31.7+0.03,.45),
                    (-20.3,3,-25.5,.70),(15.4,6,-46,.9),(16.35,6,-46.3,.65)]:crate(x,y,z,s)
    for x in [-6.6,-4.0]:
        for z in [-31.2,-30.4]:beam('AM05_workbench',(x,6,z),(x,7.05,z),.11)
    box('AM05_workbench',(-5.3,7.08,-30.8),(2.95,.16,1.08),color='#B38A54')
    for i in range(7):
        x=-6.4+i*.34
        rock_hull('AM05_sample_stones',(x-.10,7.16,-30.91),(x+.15,7.34+.12*noise(i),-30.66),1700+i)
    # Grounded lumber stock and a visibly assembled spare pick.
    for i in range(6):box('AM05_lumber',(-12.0+(i%3)*.21,.10+(i//3)*.16,-12.2),(.18,.14,2.4),color='#AC8150',collider=False)
    beam('AM05_spare_pick',(-7.6,0,-4.1),(-7.6,1.28,-4.5),.055,color='#A6814F',collider=False)
    box('AM05_spare_pick_head',(-7.6,1.25,-4.5),(.62,.12,.10),'metal','#73796D',collider=False)
    for lamp in LAMPS:lantern(lamp)
    # Small face scars are real inlaid stone, at breaks away from the ore sockets.
    for i,(x,z,y) in enumerate([(-9.8,-20.88,1.4),(-4.1,-25.48,4.5),(5.2,-35.45,7.7)]):
        rock_hull('AM06_fault_seams',(x-.55,y-.08,z-.10),(x+.95,y+.14,z+.015),1800+i)

def build_geometry():
    MESHES.clear();PROXIES.clear();VEGETATION.clear();geology()
    for route in RAMPS+[BRIDGE]+GALLERY_RAMPS+GALLERY_BRIDGES:walkway(route)
    basin();architecture();fractures_and_ground();scenic_galleries()
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
    layout=json.loads((OUT/'layout.json').read_text());layout['vegetation']=VEGETATION
    layout['vegetationContract']='facility-local +Y-up reactive grass anchors; no baked foliage in static GLB'
    (OUT/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
    (OUT/'colliders.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    evidence=Path(__file__).parent/'evidence';evidence.mkdir(exist_ok=True)
    (evidence/'proxy-parts.json').write_text(json.dumps(PROXIES,indent=1)+'\n')
    return {k:len(v['indices'])//3 for k,v in data.items()}

if __name__=='__main__':print(write_proxies())
