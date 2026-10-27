import { BufferGeometry, Float32BufferAttribute, Color, Vector2, Vector3, Quaternion, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, ShapeUtils } from 'three';
import { CLUB, CLUB_POOL, CLUB_DAYBEDS, CLUB_WALKWAYS, CLUB_PALMS, CLUB_SOFT_PLANTS, CLUB_LANTERNS, clubScatterBlocked } from './djc-club-layout';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { terrainHeight } from './WorldLandform';

type V3 = [number, number, number];
export type ClubBatch = 'wood' | 'stone' | 'metal' | 'fabric' | 'foliage' | 'glass' | 'amber' | 'cyan';
export interface ClubCollision { vertices: Float32Array; indices: Uint32Array }
export const DJC_MIRROR_POSITION: V3 = [43.5,6.25,55];
export const DJC_MIRROR_RADIUS=.85;
export const DJC_DAYBED_PAD={centerY:1.64,height:.23,radius:1.46};
export const DJC_DAYBED_TOP=DJC_DAYBED_PAD.centerY+DJC_DAYBED_PAD.height/2;
export const DJC_DAYBED_ACCESS={width:1.6,fromZ:-6.5,landingZ:-2.15,toZ:-1.15};
/** Seat-surface anchors; the character's existing seating system owns its hip offset. */
// Standard SitIdle needs its shins beyond the solid round pad: sit on the front lip,
// with a central access ramp between the two leg lanes, rather than inside the daybed.
export const DJC_CLUB_SEATS = CLUB_DAYBEDS.flatMap(([x,z],bed)=>[-.95,.95].map((dx,side)=>({id:`djc-daybed-${bed}-${side}`,bed,center:[x,z] as [number,number],position:[x+dx,DJC_DAYBED_TOP,z-.85] as V3,anchor:[x+dx,DJC_DAYBED_TOP+.25,z-1.55] as V3,yaw:Math.PI/2})));
export type DjcClubSeat=(typeof DJC_CLUB_SEATS)[number];
export const DJC_BOOTH_STAND:V3=[31,CLUB.stage[1],55];
const TAU = Math.PI * 2;
const C = { wood: '#a77749', edge: '#735035', stone: '#c7b89b', dark: '#242a2a', bronze: '#927550', fabric: '#e5d6b7', cushion: '#d6c7ac', green: '#5c7352', silver: '#9caaa7', amber: '#ffd59b', cyan: '#79cdc5' };
class Batch {
  positions: number[] = []; normals: number[] = []; colors: number[] = []; wind: number[] = [];
  add(g: BufferGeometry, color: string, sway = 0) {
    const mesh = g.index ? g.toNonIndexed() : g, p = mesh.getAttribute('position'), n = mesh.getAttribute('normal'), c = new Color(color);
    let minY=Infinity,maxY=-Infinity;
    if(sway) for(let i=0;i<p.count;i++) { minY=Math.min(minY,p.getY(i)); maxY=Math.max(maxY,p.getY(i)); }
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i)); this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      this.colors.push(c.r, c.g, c.b); this.wind.push(sway ? sway*(p.getY(i)-minY)/Math.max(.1,maxY-minY) : 0);
    }
    if (mesh !== g) mesh.dispose(); g.dispose();
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3)); g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3)); g.setAttribute('aClubWind', new Float32BufferAttribute(this.wind, 1));
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}

/** Tile gaps, alternating facets and one private reflective material, never one light per mirror. */
export function buildDjcMirrorGeometry() {
  const batch=new Batch(),r=DJC_MIRROR_RADIUS;
  const point=(lat:number,lon:number):V3=>[r*Math.sin(lat)*Math.cos(lon),r*Math.cos(lat),r*Math.sin(lat)*Math.sin(lon)];
  for(let row=0;row<14;row++) for(let col=0;col<24;col++) {
    const a=row*Math.PI/14+.013,b=(row+1)*Math.PI/14-.013,c=col*TAU/24+.012,d=(col+1)*TAU/24-.012;
    const p=[point(a,c),point(b,c),point(b,d),point(a,d)];
    batch.add(fromTriangles([...p[0],...p[2],...p[1],...p[0],...p[3],...p[2]]),['#b7c6bf','#829a94','#dae0ce','#6d8788'][(row*7+col*3)%4]);
  }
  return batch.geometry();
}

/** One bounded floor-light draw. UVs carry a soft local falloff; no shadow-map or textures. */
export function buildDjcSpotsGeometry() {
  const positions:number[]=[],uv:number[]=[],color:number[]=[];
  for(let i=0;i<84;i++) {
    const angle=i*2.39996,r=.7+7.9*Math.sqrt((i+.5)/84),x=Math.cos(angle)*r*.84,z=Math.sin(angle)*r;
    const corners=[[-.19,-.24],[-.19,.24],[.19,.24],[-.19,-.24],[.19,.24],[.19,-.24]];
    for(const [u,v] of corners) { positions.push(x+u,0,z+v);uv.push(u/.19,v/.24); const c=new Color(i%4===0?'#79d3ee':i%5===0?'#e8aad8':'#fff1ca');color.push(c.r,c.g,c.b); }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('color',new Float32BufferAttribute(color,3));g.computeBoundingSphere();return g;
}
class Collision {
  positions: number[] = [];
  triangle(a: V3, b: V3, c: V3) { this.positions.push(...a, ...b, ...c); }
  data(): ClubCollision { return { vertices: new Float32Array(this.positions), indices: Uint32Array.from({ length: this.positions.length / 3 }, (_, i) => i) }; }
}
const fromTriangles = (positions: number[]) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g; };

/** Deterministic, editable geometry. Only upward support faces enter surface; side guards and props enter solid. */
export function buildDjcClubGeometry() {
  const batches = Object.fromEntries((['wood','stone','metal','fabric','foliage','glass','amber','cyan'] as ClubBatch[]).map(k => [k, new Batch()])) as Record<ClubBatch, Batch>;
  const surface = new Collision(), solid = new Collision();
  const solidTriangles=(positions:number[])=>{for(let i=0;i<positions.length;i+=9)solid.triangle(positions.slice(i,i+3) as V3,positions.slice(i+3,i+6) as V3,positions.slice(i+6,i+9) as V3);};
  let yOffset = 0;
  const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind = 0) => batches[kind].add(g, color, wind);
  const box = (kind: ClubBatch, p: V3, size: V3, color: string, rotate = 0, collide = false) => {
    const g = kind==='fabric' ? new RoundedBoxGeometry(...size,1,Math.min(.055,...size.map(n=>n*.2))) : new BoxGeometry(...size); g.rotateY(rotate); g.translate(p[0],p[1]+yOffset,p[2]);
    if (collide) { const raw = g.index ? g.toNonIndexed() : g, m=raw.getAttribute('position'); for (let i = 0; i < m.count; i += 3) solid.triangle([m.getX(i),m.getY(i),m.getZ(i)], [m.getX(i+1),m.getY(i+1),m.getZ(i+1)], [m.getX(i+2),m.getY(i+2),m.getZ(i+2)]); if(raw!==g)raw.dispose(); }
    add(kind, g, color);
  };
  const cylinder = (kind: ClubBatch, p: V3, top: number, bottom: number, height: number, color: string, segments = 12, rotateZ = 0,collide=false) => {
    const g = new CylinderGeometry(top,bottom,height,segments); g.rotateZ(rotateZ); g.translate(p[0],p[1]+yOffset,p[2]);
    if(collide){const raw=g.toNonIndexed(),v=raw.getAttribute('position'),n=raw.getAttribute('normal');for(let i=0;i<v.count;i+=3){const a:V3=[v.getX(i),v.getY(i),v.getZ(i)],b:V3=[v.getX(i+1),v.getY(i+1),v.getZ(i+1)],c:V3=[v.getX(i+2),v.getY(i+2),v.getZ(i+2)];(n.getY(i)>.7?surface:solid).triangle(a,b,c);}raw.dispose();}
    add(kind,g,color);
  };
  const sphere = (kind: ClubBatch, p: V3, radius: number, color: string, scale: V3 = [1,1,1]) => {
    const g = new SphereGeometry(radius,12,8); g.scale(...scale); g.translate(p[0],p[1]+yOffset,p[2]); add(kind,g,color);
  };
  const rod = (kind: ClubBatch, a: V3, b: V3, radius: number, color: string, collide = false) => {
    const av = new Vector3(...a), bv = new Vector3(...b), direction = bv.clone().sub(av), g = new CylinderGeometry(radius,radius,direction.length(),8);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize())); const mid=av.add(bv).multiplyScalar(.5); g.translate(mid.x,mid.y+yOffset,mid.z);
    if (collide) { const m = g.toNonIndexed(); const p = m.getAttribute('position'); for(let i=0;i<p.count;i+=3) solid.triangle([p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],[p.getX(i+2),p.getY(i+2),p.getZ(i+2)]); m.dispose(); }
    add(kind,g,color);
  };
  const walkwayFaces:V3[][]=[];
  // Cut the existing sloped faces into a world-scale running bond. Grout is an
  // inlaid, disjoint part of the face, rather than a raised coplanar overlay.
  const stonePavers=(source:V3[])=>{
    // The wooden approaches own their footprint at a flush joint. Subtract only
    // genuinely coplanar intersections, retaining slopes and all original heights.
    let fragments=[source];
    for(const face of walkwayFaces){
      const a=new Vector3(...face[0]),normal=new Vector3(...face[1]).sub(a).cross(new Vector3(...face[2]).sub(a)).normalize();
      if(!source.every(p=>Math.abs(normal.dot(new Vector3(...p).sub(a)))<1e-6))continue;
      const halfPlane=(points:V3[],a:V3,b:V3,inside:boolean)=>{
        const distance=(p:V3)=>(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]),result:V3[]=[];
        for(let i=0;i<points.length;i++){
          const p=points[i],q=points[(i+1)%points.length],dp=distance(p),dq=distance(q),ip=inside?dp<=0:dp>=0,iq=inside?dq<=0:dq>=0;
          if(ip)result.push(p);
          if(ip!==iq){const t=dp/(dp-dq);result.push(p.map((v,k)=>v+(q[k]-v)*t) as V3);}
        }
        return result;
      };
      fragments=fragments.flatMap(polygon=>{
        const pieces:V3[][]=[];let remaining=polygon;
        for(let edge=0;edge<3&&remaining.length>=3;edge++){
          const a=face[edge],b=face[(edge+1)%3],outside=halfPlane(remaining,a,b,false);
          if(outside.length>=3)pieces.push(outside);remaining=halfPlane(remaining,a,b,true);
        }
        return pieces;
      });
    }
    for(const triangle of fragments){
    const clip=(points:V3[],axis:0|2,bound:number,greater:boolean)=>{
      const result:V3[]=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],insideA=greater?a[axis]>=bound:a[axis]<=bound,insideB=greater?b[axis]>=bound:b[axis]<=bound;
        if(insideA)result.push(a);
        if(insideA!==insideB){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push(a.map((v,k)=>v+(b[k]-v)*t) as V3);}
      }
      return result;
    };
    const emit=(x0:number,x1:number,z0:number,z1:number,color:string)=>{
      let polygon=triangle;
      for(const [axis,bound,greater]of [[0,x0,true],[0,x1,false],[2,z0,true],[2,z1,false]] as [0|2,number,boolean][])polygon=clip(polygon,axis,bound,greater);
      const points:number[]=[];
      for(let i=1;i<polygon.length-1;i++){
        const [a,b,c]=[polygon[0],polygon[i],polygon[i+1]],area=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
        if(area<1e-8)continue;points.push(...a,...b,...c);surface.triangle(a,b,c);
      }
      if(points.length)add('stone',fromTriangles(points),color);
    };
    const tileX=1.8,tileZ=1.25,gap=.012,minZ=Math.min(...triangle.map(p=>p[2])),maxZ=Math.max(...triangle.map(p=>p[2]));
    for(let row=Math.floor(minZ/tileZ);row<=Math.floor(maxZ/tileZ);row++){
      const offset=(row%2)*tileX/2,z0=row*tileZ,z1=z0+tileZ,minX=Math.min(...triangle.map(p=>p[0])),maxX=Math.max(...triangle.map(p=>p[0]));
      for(let col=Math.floor((minX-offset)/tileX);col<=Math.floor((maxX-offset)/tileX);col++){
        const x0=col*tileX+offset,x1=x0+tileX,color=['#c3bba6','#c0b8a4','#c6bea9'][((row*7+col*13)%3+3)%3];
        emit(x0+gap,x1-gap,z0+gap,z1-gap,color);
        for(const r of [[x0,x0+gap,z0,z1],[x1-gap,x1,z0,z1],[x0+gap,x1-gap,z0,z0+gap],[x0+gap,x1-gap,z1-gap,z1]])emit(r[0],r[1],r[2],r[3],'#b4ad98');
      }
    }
    }
  };
  /** Convex polygon slab, including sloped top. Its visible triangles ARE the collider triangles. */
  const slab = (kind: ClubBatch, outline: V3[], depth: number, color: string, walkable = true, pavers = false) => {
    outline=outline.map(p=>[p[0],p[1]+yOffset,p[2]]);
    const top: number[] = [], sides: number[] = [];
    for(let i=1;i<outline.length-1;i++) {
      const a=outline[0],b=outline[i+1],c=outline[i];
      if(pavers)stonePavers([a,b,c]);else{top.push(...a,...b,...c);if(walkable)surface.triangle(a,b,c);else solid.triangle(a,b,c);}
    }
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length],c:V3=[b[0],b[1]-depth,b[2]],d:V3=[a[0],a[1]-depth,a[2]];
      sides.push(...a,...b,...c,...a,...c,...d); solid.triangle(a,b,c); solid.triangle(a,c,d);
    }
    if(top.length)add(kind,fromTriangles(top),color);add(kind,fromTriangles(sides),color);
  };
  const pavedOutline=(outline:V3[])=>{
    const top:number[]=[],sides:number[]=[];
    for(const tri of ShapeUtils.triangulateShape(outline.map(p=>new Vector2(p[0],p[2])),[])) {
      const [a,b,c]=tri.map(i=>outline[i]),ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
      if(Math.abs(ny)<1e-7)continue; // Collinear outline stations are not support faces.
      const t=ny>0?[a,b,c]:[a,c,b];top.push(...t[0],...t[1],...t[2]);surface.triangle(t[0],t[1],t[2]);walkwayFaces.push(t);
    }
    for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],c:V3=[b[0],b[1]-.18,b[2]],d:V3=[a[0],a[1]-.18,a[2]];sides.push(...a,...b,...c,...a,...c,...d);}
    solidTriangles(sides);add('wood',fromTriangles(top),C.wood);add('wood',fromTriangles(sides),C.edge);
  };
  const rect = (x0:number,x1:number,z0:number,z1:number,y:number):V3[]=>[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]];
  const supportHeight=(x:number,z:number)=>{
    let y=terrainHeight(x,z);const p=surface.positions;
    for(let i=0;i<p.length;i+=9){const ax=p[i],az=p[i+2],bx=p[i+3],bz=p[i+5],cx=p[i+6],cz=p[i+8],d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-9)continue;
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,c=1-a-b;if(Math.min(a,b,c)>=-1e-6)y=Math.max(y,a*p[i+1]+b*p[i+4]+c*p[i+7]);}
    return y;
  };
  const ellipse = (x:number,z:number,rx:number,rz:number,y:number,n=64):V3[]=>Array.from({length:n},(_,i)=>[x+rx*Math.cos(i*TAU/n),y,z+rz*Math.sin(i*TAU/n)]);
  // Individually clipped boards preserve an ellipse, narrow real seams and the warm end-grain fascia.
  const floor = (cx:number,cz:number,rx:number,rz:number,y:number) => {
    for(let z=-rz+.02,row=0;z<rz-.02;z+=.28,row++) {
      const z0=z,z1=Math.min(rz-.005,z+.263), w0=rx*Math.sqrt(Math.max(0,1-z0*z0/(rz*rz))),w1=rx*Math.sqrt(Math.max(0,1-z1*z1/(rz*rz)));
      slab('wood',[[cx-w0,y,cz+z0],[cx+w0,y,cz+z0],[cx+w1,y,cz+z1],[cx-w1,y,cz+z1]],.16,row%7===0?'#b48656':row%3===0?'#967047':C.wood);
    }
  };
  floor(CLUB.dance[0],CLUB.dance[2],...CLUB.danceRadii,CLUB.dance[1]);
  const stageY=CLUB.stage[1], danceY=CLUB.dance[1];
  for(let i=0;i<12;i++) { const a=i*TAU/12,x=CLUB.dance[0]+7.3*Math.cos(a),z=CLUB.dance[2]+9.2*Math.sin(a);rod('wood',[x,1,z],[x,danceY-.1,z],.1,C.edge,true); }
  // Open stage structure. Six posts leave the under-deck space unblocked.
  for(let z=48;z<62;z+=.28) slab('wood',rect(28,36,z,z+.265,stageY),.18,C.edge);
  for(const x of [28.4,35.6]) for(const z of [48.5,55,61.5]) rod('wood',[x,1,z],[x,stageY-.12,z],.13,C.edge,true);
  slab('wood',[[28,1.01,41],[34,1.01,41],[34,stageY,48],[28,stageY,48]],.14,C.wood);
  slab('wood',[[36,stageY,51],[39,danceY,51],[39,danceY,59],[36,stageY,59]],.15,C.wood);
  // Stepping fans spread towards two irregular pool-side paths, rather than a rectangle around the venue.
  for(const p of CLUB_WALKWAYS) {
    // Triangulate the simple paving outline with Three's ear-cut tessellator below.
    const outline=p.map(([x,z])=>[x,1.4+Math.max(0,Math.min(1,(46-x)/6))*.2,z] as V3);
    pavedOutline(outline);
  }
  // Four-metre landward approach meets the existing entrance without a step.
  slab('wood',[[35,1.01,40],[40,1.01,40],[40,danceY,46],[35,danceY,46]],.13,C.wood);
  const seats=DJC_CLUB_SEATS.map(seat=>({...seat,position:[...seat.position] as V3}));
  // A mineral basin follows the shared analytic floor over 12 radial courses.
  for(let ring=0;ring<12;ring++)for(let i=0;i<CLUB_POOL.segments;i++) {
    const a=i*TAU/CLUB_POOL.segments,b=(i+1)*TAU/CLUB_POOL.segments;
    const point=(angle:number,t:number):V3=>{const q=CLUB_POOL.boundary(angle),x=CLUB.pool[0]+(q[0]-CLUB.pool[0])*t,z=CLUB.pool[2]+(q[1]-CLUB.pool[2])*t;return [x,CLUB_POOL.floorHeight(x,z),z];};
    const a0=point(a,ring/12),a1=point(a,(ring+1)/12),b1=point(b,(ring+1)/12),b0=point(b,ring/12);
    const top=ring===0?[...a0,...b1,...a1]:[...a0,...b1,...a1,...a0,...b0,...b1];
    for(let t=0;t<top.length;t+=9)surface.triangle(top.slice(t,t+3) as V3,top.slice(t+3,t+6) as V3,top.slice(t+6,t+9) as V3);
    // One continuous mineral colour: the radial tessellation must never become a checkerboard.
    add('stone',fromTriangles(top),'#a4b3ab');
  }
  // Wide stone deck and bevelled coping follow the same freeform outline.
  for(let i=0;i<CLUB_POOL.segments;i++) {
    const a=i*TAU/CLUB_POOL.segments,b=(i+1)*TAU/CLUB_POOL.segments,mid=(a+b)/2;
    const p=(t:number,o:number,y:number):V3=>{const q=CLUB_POOL.boundary(t,o);return[q[0],y,q[1]];};
    const width=2.8+.45*Math.sin(mid*4+.4);
    // Four broad bays keep an exit nearby around the enlarged basin.
    const access=Math.abs(Math.cos(mid))<.22||Math.abs(Math.sin(mid))<.28;
    const coping=access?1.35:.52;
    slab('stone',[p(a,0,access?1:1.43),p(a,coping,1.43),p(b,coping,1.43),p(b,0,access?1:1.43)],.14,'#d0c7af');
    slab('stone',[p(a,coping,1.4),p(a,width,1.4),p(b,width,1.4),p(b,coping,1.4)],.4,'#c3baa2',true,true);
    slab('stone',[p(a,width,1.4),p(a,width+2.4,1.015),p(b,width+2.4,1.015),p(b,width,1.4)],.1,'#b8ae92',true,true);
  }
  // A submerged ledge follows the pavilion side, with visible mosaic nosing and room around both ends.
  for(let i=0;i<14;i++) {
    const a=2.79+i*.047,b=a+.047,p=(t:number,o:number):V3=>{const q=CLUB_POOL.boundary(t,o);return[q[0],1.035,q[1]];};
    slab('stone',[p(a,-1.8),p(a,-.8),p(b,-.8),p(b,-1.8)],.42,i%3?'#88a7a0':'#c4cbb8');
  }
  const daybedApproaches:{from:V3;to:V3;width:number}[]=[];
  for(const [x,z] of CLUB_DAYBEDS) {
    const half=DJC_DAYBED_ACCESS.width/2,start=z+DJC_DAYBED_ACCESS.fromZ,landing=z+DJC_DAYBED_ACCESS.landingZ,end=z+DJC_DAYBED_ACCESS.toZ;
    // The first access crosses the pool coping: a crossfall averaged between sand and
    // coping would drop its centre line off that coping. Start at its highest real support.
    const startY=Math.max(supportHeight(x-half,start),supportHeight(x+half,start),supportHeight(x,start)),left=startY,right=startY;
    // The zero-friction dynamic capsule must reach an actual flat standing landing.
    // Ease both grade changes; one continuous shell avoids internal vertical collider seams.
    const rows:V3[][]=[],length=landing-start,easeIn=.4,easeOut=.8,effective=length-(easeIn+easeOut)/2;
    for(let i=0;i<=14;i++){const u=length*i/14,integral=u<easeIn?u*u/(2*easeIn):u>length-easeOut?effective-(length-u)**2/(2*easeOut):u-easeIn/2;
      const t=integral/effective;rows.push([[x-half,left+(DJC_DAYBED_TOP-left)*t,start+u],[x+half,right+(DJC_DAYBED_TOP-right)*t,start+u]]);}
    rows.push([[x-half,DJC_DAYBED_TOP,end],[x+half,DJC_DAYBED_TOP,end]]);
    const top:number[]=[],sides:number[]=[];
    for(let i=0;i<rows.length-1;i++){const [a,b]=rows[i],[d,c]=rows[i+1];top.push(...a,...c,...b,...a,...d,...c);surface.triangle(a,c,b);surface.triangle(a,d,c);}
    const outline=[rows[0][0],...rows.map(r=>r[1]),...rows.slice(1).reverse().map(r=>r[0])];
    for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],c:V3=[b[0],b[1]-.12,b[2]],d:V3=[a[0],a[1]-.12,a[2]];sides.push(...a,...b,...c,...a,...c,...d);}
    add('wood',fromTriangles(top),C.wood);add('wood',fromTriangles(sides),C.edge);solidTriangles(sides);
    daybedApproaches.push({from:[x,(left+right)/2,start],to:[x,DJC_DAYBED_TOP,end],width:DJC_DAYBED_ACCESS.width});
    // The timber rim occupies the old stone envelope, leaving access and leg lanes unchanged.
    slab('stone',ellipse(x,z,1.65,1.65,1.38,32),.88,'#c4bda6');
    slab('wood',ellipse(x,z,1.65,1.65,1.5,32),.12,'#956a43');
    cylinder('fabric',[x,DJC_DAYBED_PAD.centerY,z],DJC_DAYBED_PAD.radius,DJC_DAYBED_PAD.radius,DJC_DAYBED_PAD.height,'#3e8582',32,0,true);
    for(const dx of [-.69,0,.69])box('fabric',[x+dx,1.94,z+.92],[.66,.55,.36],'#31666a',0,true);
    const piping=new TorusGeometry(1.445,.012,4,48);piping.rotateX(Math.PI/2);piping.translate(x,1.71,z);add('fabric',piping,'#57908a');
    // Small inset end-grain blocks articulate the rim without projecting into the approach.
    for(const angle of [.25,1.05,2.1,2.9,3.65,5.75]){
      const px=x+1.57*Math.cos(angle),pz=z+1.57*Math.sin(angle);
      box('wood',[px,1.455,pz],[.09,.075,.14],'#795737',-angle);
    }
    for(const dx of [-.67,.67]) box('fabric',[x+dx,1.94,z+.45],[.48,.4,.2],'#254f55',-.1*dx);
    // Keep the bedside tray behind the front sitting/standing routes.
    const tx=x-1.26,tz=z+.05;
    cylinder('wood',[tx,1.82,tz],.32,.34,.1,C.edge,18,0,true);
    // A compact framed lantern lives on each bedside table, with solid timber feet and handle.
    cylinder('amber',[tx,2.02,tz],.07,.07,.22,C.amber,8);
    for(const dx of [-.095,.095])for(const dz of [-.095,.095])rod('wood',[tx+dx,1.88,tz+dz],[tx+dx,2.16,tz+dz],.018,C.edge);
    box('wood',[tx,2.17,tz],[.24,.045,.24],C.edge);
  }
  for(let i=0;i<12;i++) {
    const a=i*TAU/12+.15;if(Math.abs(Math.cos(a))<.2)continue;
    const [x,z]=CLUB_POOL.boundary(a,2.25);
    box('wood',[x,1.6,z],[.3,.4,.3],C.edge,0,true);
    box('amber',[x,1.93,z],[.19,.27,.19],C.amber);
    for(const dx of [-.115,.115])for(const dz of [-.115,.115])rod('wood',[x+dx,1.77,z+dz],[x+dx,2.12,z+dz],.02,C.edge);
    box('wood',[x,2.14,z],[.31,.06,.31],C.edge);
  }
  // Compact bamboo bar on the north shoulder, with four stools and a woven pitched roof.
  slab('wood',rect(35.5,46,37.8,42.3,1.2),.2,C.wood);
  for(const x of [36,45.5]) for(const z of [38.2,41.8]) rod('wood',[x,1.2,z],[x,4.6,z],.13,'#a88042',true);
  box('wood',[40.8,1.73,38.65],[8.8,1.06,.12],C.edge,0,true);
  for(let x=36.5;x<45.2;x+=.2) rod('wood',[x,1.2,38.8],[x,2.25,38.8],.07,x%1>.5?C.edge:C.wood);
  slab('stone',rect(36.3,45.3,38.4,39.25,2.36),.13,C.stone,false);
  for(let x=37.2;x<=44.5;x+=2.3) {
    cylinder('wood',[x,1.79,41.35],.33,.33,.11,C.wood,18,0,true);
    for(const dz of [-.2,.2]) for(const dx of [-.2,.2]) rod('metal',[x+dx,1.2,41.35+dz],[x+dx*.8,1.75,41.35+dz*.8],.027,C.dark,true);
    for(let k=0;k<3;k++) { const bx=x+(k-1)*.22; cylinder('glass',[bx,2.49,38.85],.045,.055,.2,k===1?'#687f68':'#b79a66',10); cylinder('metal',[bx,2.62,38.85],.025,.025,.07,C.bronze,8); }
  }
  yOffset=stageY-1.8;
  // DJ console: tapered stand, front battens, two real jog platters and a mixer section.
  slab('wood',rect(32.12,33.48,52.5,57.5,2.72),.16,C.edge,false);
  for(const z of [52.7,57.3]) for(const x of [32.25,33.3]) rod('metal',[x,1.8,z],[x,2.65,z],.055,C.dark,true);
  for(let z=52.58;z<57.48;z+=.16) box('wood',[33.47,2.26,z],[.08,.72,.105],C.wood);
  // The face points +X. Controller long axis is world Z, its operator stands to the west.
  box('metal',[32.7,2.79,55],[1.04,.13,3.68],C.dark);
  for(const z of [53.85,56.15]) {
    cylinder('metal',[32.72,2.88,z],.42,.43,.075,'#a3aaa4',32);
    cylinder('metal',[32.72,2.924,z],.337,.337,.018,'#333936',32);
    cylinder('metal',[32.72,2.938,z],.09,.09,.012,C.bronze,20);
    const g=new TorusGeometry(.35,.012,4,40); g.rotateX(Math.PI/2); g.translate(32.72,2.94+yOffset,z); add('metal',g,'#bec3b3');
    box('cyan',[32.94,2.87,z+.46],[.25,.017,.24],C.cyan);
    for(let row=0;row<2;row++) for(let col=0;col<4;col++) box(col===0?'amber':'cyan',[32.34+row*.13,2.88,z-.27+col*.15],[.095,.016,.11],col===0?C.amber:C.cyan);
    rod('metal',[33.06,2.92,z-.3],[32.9,2.96,z-.12],.018,C.silver);
    rod('metal',[32.9,2.96,z-.12],[32.79,2.96,z-.1],.015,C.silver);
    for(const dx of [-.32,.32]) cylinder('metal',[32.7+dx,2.9,z+.3],.035,.035,.05,C.silver,10);
  }
  for(const z of [54.6,54.87,55.13,55.4]) {
    for(let row=0;row<4;row++) cylinder('metal',[32.45+row*.16,2.905,z],.034,.034,.07,row===0?C.bronze:C.silver,10);
    box('metal',[32.95,2.865,z],[.26,.012,.015],'#111918'); box('metal',[32.92,2.895,z],[.065,.035,.055],C.silver);
  }
  box('metal',[32.29,2.87,55],[.018,.012,.7],'#0e1515'); box('metal',[32.29,2.9,55],[.06,.035,.12],C.silver);
  // Headphone band and coiled patch cables are tubes, not painted decals.
  const band=new TorusGeometry(.19,.022,6,20,Math.PI); band.rotateY(Math.PI/2); band.translate(32.5,2.97+yOffset,57.21); add('metal',band,C.dark);
  for(const dz of [-.18,.18]) sphere('metal',[32.5,2.97,57.21+dz],.075,C.dark,[.65,1,1]);
  for(let i=0;i<18;i++) { const a=i*.42,b=(i+1)*.42; rod('metal',[32.1+.12*Math.sin(a),2.55-i*.034,57.22+.08*Math.cos(a)],[32.1+.12*Math.sin(b),2.55-(i+1)*.034,57.22+.08*Math.cos(b)],.012,C.dark); }
  for(const z of [49.1,60.9]) {
    box('metal',[35.1,2.7,z],[.9,1.55,.78],C.dark,0,true);
    for(const y of [2.39,2.97]) cylinder('metal',[35.56,y,z],.24,.25,.035,'#101817',24,-Math.PI/2);
    cylinder('metal',[35.59,3.25,z],.09,.09,.025,C.bronze,16,-Math.PI/2);
    rod('metal',[35.1,1.8,z],[35.1,1.96,z],.14,C.dark);
  }
  yOffset=0;
  // Main FINNS-inspired roof: broad faceted thatch on three exposed bundled bamboo arches.
  // The swept roof is one opaque shell. Seams are shallow geometry rather than resort textures.
  const roofY=(x:number,z:number)=>7.3+3.6*(1-Math.pow(Math.abs(z-55)/13.2,1.65))+.025*(x-26);
  const roof: number[]=[];
  for(let i=0;i<12;i++) for(let j=0;j<28;j++) {
    const x0=26+i*2,x1=x0+2,z0=41.8+j*26.4/28,z1=z0+26.4/28;
    const p:V3[]=[[x0,roofY(x0,z0),z0],[x1,roofY(x1,z0),z0],[x1,roofY(x1,z1),z1],[x0,roofY(x0,z1),z1]];
    roof.push(...p[0],...p[2],...p[1],...p[0],...p[3],...p[2]);
  }
  add('fabric',fromTriangles(roof),'#b29153');
  // A 15 cm thatch shell reads as a built roof from the sea-facing edge.
  const underside:number[]=[],fascia:number[]=[];
  for(let i=0;i<roof.length;i+=9) {
    for(const j of [0,6,3]) underside.push(roof[i+j],roof[i+j+1]-.15,roof[i+j+2]);
  }
  const roofEdge=(a:V3,b:V3)=>{
    const c:V3=[b[0],b[1]-.15,b[2]],d:V3=[a[0],a[1]-.15,a[2]];
    fascia.push(...a,...b,...c,...a,...c,...d);
  };
  for(let i=0;i<12;i++) for(const z of [41.8,68.2]) {
    const x=26+i*2,a:V3=[x,roofY(x,z),z],b:V3=[x+2,roofY(x+2,z),z];roofEdge(z<55?a:b,z<55?b:a);
  }
  for(let j=0;j<28;j++) for(const x of [26,50]) {
    const z=41.8+j*26.4/28,z1=z+26.4/28,a:V3=[x,roofY(x,z),z],b:V3=[x,roofY(x,z1),z1];roofEdge(x>38?a:b,x>38?b:a);
  }
  add('fabric',fromTriangles(underside),'#947a44');add('fabric',fromTriangles(fascia),'#99783f');
  // Camera sweeps must hit the same closed shell seen by the player, including its lower face.
  // The decorative 5.5 cm courses and tiny fringe remain visual-only above this bounded guard.
  for(const shell of [roof,underside,fascia])solidTriangles(shell);
  // Eight broad thatch course edges break up the canopy at a deliberate structural rhythm.
  for(const x of [28,31,34,37,40,43,46,49]) {
    const course:number[]=[],lip:number[]=[];
    for(let j=0;j<28;j++) {
      const z=41.8+j*26.4/28,z1=z+26.4/28;
      const a:V3=[x-.45,roofY(x-.45,z)+.055,z],b:V3=[x+.45,roofY(x+.45,z)+.055,z];
      const c:V3=[x+.45,roofY(x+.45,z1)+.055,z1],d:V3=[x-.45,roofY(x-.45,z1)+.055,z1];
      course.push(...a,...c,...b,...a,...d,...c);
      const e:V3=[b[0],b[1]-.055,b[2]],f:V3=[c[0],c[1]-.055,c[2]];
      lip.push(...b,...c,...f,...b,...f,...e);
    }
    add('fabric',fromTriangles(course),'#bea162');add('fabric',fromTriangles(lip),'#92733e');
  }
  for(const x of [28,37,47]) {
    for(const bundle of [-.17,0,.17]) for(let i=0;i<22;i++) {
      const curve=(t:number):V3=>[x+bundle,1.6+9.05*Math.sin(t*Math.PI),55-11*Math.cos(t*Math.PI)];
      // One complete central pole per bundle is the upper structural guard: 66 arc segments total.
      rod('wood',curve(i/22),curve((i+1)/22),.115,bundle?'#a87c3f':'#c29952',bundle===0||i<2||i>19);
      if(i%3===0) {
        const p=new Vector3(...curve(i/22)),tangent=new Vector3(0,9.05*Math.cos(i*Math.PI/22),11*Math.sin(i*Math.PI/22)).normalize().multiplyScalar(.035);
        rod('wood',p.clone().sub(tangent).toArray() as V3,p.clone().add(tangent).toArray() as V3,.135,'#745833',bundle===0||i<2||i>19);
      }
    }
    // Two turns of fibre lashing bind each three-pole arch, within its existing bundle envelope.
    for(const i of [3,9,15,21]){
      const t=i/22,tangent=new Vector3(0,9.05*Math.cos(t*Math.PI),11*Math.sin(t*Math.PI)).normalize(),q=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),tangent);
      for(const turn of [-.03,.03]){
        const g=new TorusGeometry(.26,.012,4,12);g.scale(1,.36,1);g.applyQuaternion(q);
        g.translate(x,1.6+9.05*Math.sin(t*Math.PI)+tangent.y*turn,55-11*Math.cos(t*Math.PI)+tangent.z*turn);add('wood',g,'#68543b');
      }
    }
    for(const sign of [-1,1]) {
      rod('wood',[x,1.6,55+sign*11],[x,7.9,55+sign*10.5],.16,'#a77b3f',true);
      rod('wood',[x,3.7,55+sign*10.8],[x-2,7.1,55+sign*7.2],.1,'#bd9651',true);
      cylinder('wood',[x,1.75,55+sign*11],.28,.3,.3,C.edge,10);
    }
  }
  for(let z=42;z<=68;z+=2.15) rod('wood',[26,roofY(26,z)-.17,z],[50,roofY(50,z)-.17,z],.085,'#846236',true);
  // Continuous rounded bamboo verge caps give the thin thatch cut edge a readable finish.
  // These slightly extend the shell, so the visible cap also participates in camera collision.
  for(const x of [25.965,50.035])for(let j=0;j<28;j++){
    const z=41.8+j*26.4/28,z1=z+26.4/28;
    rod('wood',[x,roofY(x,z)-.08,z],[x,roofY(x,z1)-.08,z1],.07,'#98753f',true);
  }
  for(let x=26;x<=50;x+=1.2) for(const sign of [-1,1]) {
    const z=55+sign*13.2; rod('wood',[x,roofY(x,z)-.15,z],[x+.6,roofY(x+.6,z)-.19,z],.09,'#87683b');
    // Sparse, visibly faceted fringe remains part of the roof silhouette.
    const fringe:V3[]=[[x,roofY(x,z),z],[x+.72,roofY(x+.72,z),z],[x+.63,roofY(x+.63,z)-.32,z+sign*.2],[x+.12,roofY(x+.12,z)-.25,z+sign*.22]];
    add('fabric',fromTriangles([...fringe[0],...fringe[1],...fringe[2],...fringe[0],...fringe[2],...fringe[3]]),'#ac884c');
  }
  // Bar roof repeats the same material language at a quieter scale.
  for(const sign of [-1,1]) {
    const z=40+sign*2.9;
    const canopy=[35,4.5,z,46.5,5.7,40,35,5.7,40,35,4.5,z,46.5,4.5,z,46.5,5.7,40];solidTriangles(canopy);add('fabric',fromTriangles(canopy),'#a58a50');
    rod('wood',[35,4.45,z],[46.5,4.45,z],.09,C.edge,true);
  }
  rod('wood',[35,5.65,40],[46.5,5.65,40],.1,C.edge,true);
  // Mirror ball suspension and bounded stage lamps attach to a real cross beam.
  rod('wood',[43.5,8.65,47],[43.5,8.65,63],.13,'#98713f',true);
  rod('metal',[43.5,8.65,55],[43.5,6.95,55],.018,C.dark);
  for(const z of [48,62]) {
    rod('metal',[43.5,8.5,z],[43.5,8.15,z],.035,C.dark);
    cylinder('metal',[43.5,8.05,z],.14,.2,.32,C.dark,12);
    cylinder(z<55?'amber':'cyan',[43.5,7.88,z],.13,.13,.018,z<55?C.amber:C.cyan,12);
  }
  // Small wicker lanterns and a single warm bar strip. They share two emissive batches.
  for(const [x,y,z] of CLUB_LANTERNS) {
    cylinder('amber',[x,y,z],.11,.11,.3,C.amber,8);
    for(let i=0;i<8;i++) { const a=i*TAU/8; rod('wood',[x+.17*Math.cos(a),y-.2,z+.17*Math.sin(a)],[x+.14*Math.cos(a),y+.2,z+.14*Math.sin(a)],.018,C.edge); }
    cylinder('wood',[x,y+.21,z],.18,.18,.05,C.edge,10);
  }
  box('amber',[40.8,2.2,38.35],[8.8,.06,.035],C.amber);
  // A small architectural DJC wordmark, built as actual rounded strokes on the front bamboo beam.
  rod('wood',[49.96,8.6,51.9],[49.96,8.6,57.6],.12,C.edge);
  for(const z of [51.9,57.6]) rod('wood',[49.96,8.6,z],[49.96,roofY(49.96,z)-.12,z],.07,C.edge);
  // Front is +X: a viewer on the sea side sees screen-right along -Z.
  // Reflect both letter order and strokes once; the real back naturally remains mirrored.
  const letter=(z:number,points:[number,number][])=>{ for(let i=0;i<points.length-1;i++) rod('fabric',[50.12,8.7+points[i][1],110-z-points[i][0]],[50.12,8.7+points[i+1][1],110-z-points[i+1][0]],.085,'#e3d5ae'); };
  letter(52.5,[[0,0],[0,1.35],[.45,1.35],[.85,1.1],[.95,.65],[.8,.2],[.45,0],[0,0]]);
  letter(54.4,[[0,.3],[.15,.05],[.45,0],[.7,.25],[.7,1.35],[.1,1.35],[1.05,1.35]]);
  letter(56.3,[[.95,1.15],[.65,1.35],[.25,1.25],[0,.9],[0,.4],[.25,.05],[.65,0],[.95,.2]]);
  // All soft forms reuse one batch and shader. Distance along each leaf, rather
  // than its world Y, anchors the root while allowing drooping tips to move.
  const softLeaf=(points:number[],color:string,root:V3,reach:number,sway:number)=>{
    const visible:number[]=[];
    for(let i=0;i<points.length;i+=9){
      const a=new Vector3().fromArray(points,i),b=new Vector3().fromArray(points,i+3),c=new Vector3().fromArray(points,i+6);
      if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12)visible.push(...points.slice(i,i+9));
    }
    if(!visible.length)return;
    const start=batches.foliage.wind.length;add('foliage',fromTriangles(visible),color);
    for(let i=start;i<batches.foliage.wind.length;i++){
      const p=batches.foliage.positions,t=Math.min(1,Math.hypot(p[i*3]-root[0],p[i*3+1]-root[1],p[i*3+2]-root[2])/reach);
      batches.foliage.wind[i]=t<.001?0:sway*t*t*(3-2*t);
    }
  };
  const plantingClear=(x:number,z:number)=>!clubScatterBlocked(x,z)&&Array.from({length:8},(_,i)=>i*TAU/8).every(a=>!clubScatterBlocked(x+.22*Math.cos(a),z+.22*Math.sin(a)));
  const groundLeaf=(points:number[],color:string,root:V3,reach:number,sway:number)=>{
    // Reserve the same circulation mask used by terrain scatter, including a
    // small visual margin. Soft geometry never grows across the entrance or pool paths.
    for(let i=0;i<points.length;i+=3)if(!plantingClear(points[i],points[i+2]))return;
    softLeaf(points,color,root,reach,sway);
  };
  // Pinnate palm crowns: a slender rachis and ten separated pairs of folded
  // leaflets replace the old solid triangular fans, preserving the original crown envelope.
  for(const [cx,cz,h,phase] of CLUB_PALMS) {
    const base=terrainHeight(cx,cz),top:V3=[cx+.6*Math.sin(phase),base+h,cz+.6*Math.cos(phase)];
    for(let i=0;i<7;i++) {
      const at=(t:number):V3=>[cx+.6*Math.sin(phase)*t*t,base+h*t,cz+.6*Math.cos(phase)*t*t];
      rod('wood',at(i/7),at((i+1)/7),.16-.065*i/7,i%2?'#74634a':'#857251',true);
    }
    for(let leaf=0;leaf<9;leaf++) {
      const a=leaf*TAU/9+phase,length=2.6+(leaf%3)*.28,positions:number[]=[];
      const center=(t:number):V3=>[top[0]+Math.cos(a)*length*t,top[1]+.6*Math.sin(t*Math.PI)-1.25*t*t,top[2]+Math.sin(a)*length*t];
      const point=(t:number,offset:number,raise=0):V3=>{const p=center(t);return[p[0]+Math.sin(a)*offset,p[1]+raise,p[2]-Math.cos(a)*offset];};
      for(let i=0;i<8;i++){
        const t=i/8,u=(i+1)/8,w=t===0?0:.027*(1-t)+.006,v=.027*(1-u)+.006;
        positions.push(...point(t,-w),...point(u,v),...point(u,-v),...point(t,-w),...point(t,w),...point(u,v));
      }
      for(let i=0;i<10;i++)for(const side of [-1,1]){
        const t=.11+i*.081,tipT=t+.075,span=.48*Math.sin(Math.PI*(t+.05)),width=.025+.031*Math.sin(Math.PI*t);
        const root=center(t),back=point(t+.025,side*span*.48,-.025),tip=point(tipT,side*span,-.09-.08*t),front=point(t+width,side*span*.47,-.018),ridge=point(t+.037,side*span*.46,.028);
        positions.push(...root,...back,...ridge,...back,...tip,...ridge,...tip,...front,...ridge,...front,...root,...ridge);
      }
      softLeaf(positions,leaf%3?'#61724b':'#758052',top,length,.55);
    }
  }
  // Eight planted islands retain open gaps. Each has a restrained agave core,
  // two offset broad-leaf fans and one low tuft, rooted to the sampled terrain.
  for(const [group,[x,z]]of CLUB_SOFT_PLANTS.entries()) {
    const base=terrainHeight(x,z),phase=group*2.39996;
    for(let i=0;i<6;i++){
      const a=i*TAU/6+phase,h=.65+(i%3)*.14,w=.15,root:V3=[x,base+.015,z],tip:V3=[x+Math.cos(a)*.85,base+h,z+Math.sin(a)*.85];
      groundLeaf([...root,x+Math.sin(a)*w,base+.3,z-Math.cos(a)*w,...tip,...root,...tip,x-Math.sin(a)*w,base+.3,z+Math.cos(a)*w],i%3?'#6f7e4a':'#859359',root,1.1,.35);
    }
    for(let clump=0;clump<2;clump++){
      const theta=phase+clump*2.4,rx=x+.58*Math.cos(theta),rz=z+.58*Math.sin(theta),root:V3=[rx,terrainHeight(rx,rz)+.015,rz];
      for(let leaf=0;leaf<5;leaf++){
        const a=theta+leaf*TAU/5,reach=.58+(leaf%2)*.15,height=(clump?1.12:1.6)-leaf*.065,width=clump?.19:.27,points:number[]=[];
        const p=(t:number,side:number):V3=>{
          const r=reach*Math.pow(t,1.35),w=width*Math.sin(Math.PI*Math.max(0,(t-.18)/.82)),px=rx+Math.cos(a)*r+Math.sin(a)*w*side,pz=rz+Math.sin(a)*r-Math.cos(a)*w*side;
          return[px,Math.max(terrainHeight(px,pz)+.015,root[1]+height*Math.sin(t*Math.PI*.78)+(side===0?w*.2:0)),pz];
        };
        for(let i=0;i<6;i++)for(const side of [-1,1]){const t=i/6,u=(i+1)/6;points.push(...p(t,0),...p(u,side),...p(t,side),...p(t,0),...p(u,0),...p(u,side));}
        groundLeaf(points,leaf%2?'#547956':'#71905d',root,height,.5);
      }
    }
    const tx=x+.75*Math.cos(phase+3.8),tz=z+.75*Math.sin(phase+3.8),root:V3=[tx,terrainHeight(tx,tz)+.015,tz];
    for(let leaf=0;leaf<12;leaf++){
      const a=phase+leaf*2.39996,h=.38+(leaf%4)*.075,reach=.36+(leaf%3)*.08,w=.026,mid:V3=[tx+Math.cos(a)*reach*.35,root[1]+h*.82,tz+Math.sin(a)*reach*.35],tip:V3=[tx+Math.cos(a)*reach,root[1]+h*.68,tz+Math.sin(a)*reach];
      const l:V3=[mid[0]+Math.sin(a)*w,mid[1],mid[2]-Math.cos(a)*w],r:V3=[mid[0]-Math.sin(a)*w,mid[1],mid[2]+Math.cos(a)*w];
      groundLeaf([...root,...l,...mid,...root,...mid,...r,...l,...tip,...mid,...mid,...tip,...r],'#87945e',root,h,.4);
    }
  }
  for(const z of [47,63]) {
    cylinder('wood',[74,2.7,z],.05,.065,2.6,C.edge,8,0,true);
    const umbrella=new CylinderGeometry(.05,1.65,.65,8,1,true); umbrella.translate(74,3.9,z);const raw=umbrella.toNonIndexed();solidTriangles(Array.from(raw.getAttribute('position').array));raw.dispose();add('fabric',umbrella,'#c6b17d');
    box('wood',[74,1.42,z],[1.2,.16,2.4],C.edge,0,true); box('fabric',[74,1.6,z],[1.12,.19,2.3],'#43827e',0,true);
  }
  // Pool water has its own transparent draw, no support or side collider.
  const poolOutline=CLUB_POOL.outline.map(([x,z])=>[x,CLUB_POOL.waterY,z] as V3),water:number[]=[];
  for(let i=0;i<CLUB_POOL.segments;i++) water.push(CLUB.pool[0],CLUB_POOL.waterY,CLUB.pool[2],...poolOutline[(i+1)%CLUB_POOL.segments],...poolOutline[i]);
  const pool=fromTriangles(water);
  pool.userData={shape:'djc-pool',waterY:CLUB_POOL.waterY,outline:CLUB_POOL.outline};
  const built=Object.fromEntries(Object.entries(batches).map(([key,batch])=>[key,batch.geometry()])) as Record<ClubBatch,BufferGeometry>;
  built.foliage.boundingBox?.expandByScalar(.75);if(built.foliage.boundingSphere)built.foliage.boundingSphere.radius+=.75;
  built.foliage.userData={worldWind:true,softPush:true,pushMax:.62};
  return { batches: built, colliders: { surface: surface.data(), solid: solid.data() }, seats, pool,daybedApproaches };
}
