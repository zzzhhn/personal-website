import { BufferGeometry, Float32BufferAttribute, Color, Vector3, Quaternion, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { CLUB } from './djc-club-layout';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type V3 = [number, number, number];
export type ClubBatch = 'wood' | 'stone' | 'metal' | 'fabric' | 'foliage' | 'glass' | 'amber' | 'cyan';
export interface ClubCollision { vertices: Float32Array; indices: Uint32Array }
export const DJC_MIRROR_POSITION: V3 = [43.5,6.25,55];
const DAYBEDS:[number,number][]=[[61,50],[61,60],[64.5,55]];
/** Seat-surface anchors; the character's existing seating system owns its hip offset. */
export const DJC_CLUB_SEATS = DAYBEDS.flatMap(([x,z])=>[-.67,.67].map(dx=>({position:[x+dx,1.79,z] as V3,yaw:Math.PI})));
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
  const batch=new Batch(),r=.66;
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
  for(let i=0;i<36;i++) {
    const angle=i*2.39996,r=.9+6.2*Math.sqrt((i+.5)/36),x=Math.cos(angle)*r*.86,z=Math.sin(angle)*r;
    const corners=[[-.16,-.25],[-.16,.25],[.16,.25],[-.16,-.25],[.16,.25],[.16,-.25]];
    for(const [u,v] of corners) { positions.push(x+u,0,z+v);uv.push(u/.16,v/.25); const c=new Color(i%7===0?'#76c6bd':'#f3c780');color.push(c.r,c.g,c.b); }
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
  const cylinder = (kind: ClubBatch, p: V3, top: number, bottom: number, height: number, color: string, segments = 12, rotateZ = 0) => {
    const g = new CylinderGeometry(top,bottom,height,segments); g.rotateZ(rotateZ); g.translate(p[0],p[1]+yOffset,p[2]); add(kind,g,color);
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
  /** Convex polygon slab, including sloped top. Its visible triangles ARE the collider triangles. */
  const slab = (kind: ClubBatch, outline: V3[], depth: number, color: string, walkable = true) => {
    outline=outline.map(p=>[p[0],p[1]+yOffset,p[2]]);
    const top: number[] = [], sides: number[] = [];
    for(let i=1;i<outline.length-1;i++) {
      const a=outline[0],b=outline[i+1],c=outline[i]; top.push(...a,...b,...c); if(walkable) surface.triangle(a,b,c); else solid.triangle(a,b,c);
    }
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length],c:V3=[b[0],b[1]-depth,b[2]],d:V3=[a[0],a[1]-depth,a[2]];
      sides.push(...a,...b,...c,...a,...c,...d); solid.triangle(a,b,c); solid.triangle(a,c,d);
    }
    add(kind,fromTriangles(top),color); add(kind,fromTriangles(sides),color);
  };
  const rect = (x0:number,x1:number,z0:number,z1:number,y:number):V3[]=>[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]];
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
  // Broad front corners lead around the pool; there is no front wall or railing across either exit.
  for(const [z0,z1] of [[43.4,47.0],[63.0,66.6]]) {
    slab('wood',[[40,danceY,z0],[48,1.36,z0],[48,1.36,z1],[40,danceY,z1]],.16,C.wood);
    slab('stone',rect(48,65,z0,z1,1.36),.34,C.stone);
    slab('stone',[[65,1.36,z0],[69,1.01,z0],[69,1.01,z1],[65,1.36,z1]],.18,C.stone);
  }
  // Four-metre landward approach meets the existing entrance without a step.
  slab('wood',[[35,1.01,40],[40,1.01,40],[40,danceY,46],[35,danceY,46]],.13,C.wood);
  const seats=DJC_CLUB_SEATS.map(seat=>({...seat,position:[...seat.position] as V3}));
  // Visible mineral lining sits on the natural earth, below the shallow water.
  // A real bottom keeps the island's grass material from showing through the pool.
  slab('stone',ellipse(57,55,6.98,9.98,1.015,72),.012,'#79a6a0');
  // Pool water is never an invisible solid box; north/south ramps remain its exits.
  for(let i=0;i<72;i++) {
    const a=i*TAU/72,b=(i+1)*TAU/72,mid=(a+b)/2;
    if(Math.abs(Math.cos(mid))<.24) continue; // 3.4 m north/south water access.
    slab('stone',[[57+7*Math.cos(a),1.4,55+10*Math.sin(a)],[57+7.75*Math.cos(a),1.4,55+10.75*Math.sin(a)],[57+7.75*Math.cos(b),1.4,55+10.75*Math.sin(b)],[57+7*Math.cos(b),1.4,55+10*Math.sin(b)]],.4,i%4?'#c6bea7':'#d4ccb4');
  }
  for(const sign of [-1,1]) { const path:V3[]=[[55.3,1.01,55+sign*4.5],[58.7,1.01,55+sign*4.5],[58.7,1.36,55+sign*8],[55.3,1.36,55+sign*8]]; slab('stone',sign<0?path.reverse():path,.09,C.stone); }
  for(const [x,z] of DAYBEDS) {
    slab('stone',ellipse(x,z,1.65,1.65,1.5,32),.5,'#c4bda6');
    cylinder('fabric',[x,1.64,z],1.46,1.46,.23,'#3e8582',32);
    box('fabric',[x,1.94,z+.92],[2.05,.55,.36],'#31666a');
    for(const dx of [-.67,.67]) box('fabric',[x+dx,1.94,z+.45],[.48,.4,.2],'#254f55',-.1*dx);
    cylinder('wood',[x-1.05,1.82,z-.58],.32,.34,.1,C.edge,18);
  }
  // Compact bamboo bar on the north shoulder, with four stools and a woven pitched roof.
  slab('wood',rect(35.5,46,37.8,42.3,1.2),.2,C.wood);
  for(const x of [36,45.5]) for(const z of [38.2,41.8]) rod('wood',[x,1.2,z],[x,4.6,z],.13,'#a88042',true);
  for(let x=36.5;x<45.2;x+=.2) rod('wood',[x,1.2,38.8],[x,2.25,38.8],.07,x%1>.5?C.edge:C.wood);
  slab('stone',rect(36.3,45.3,38.4,39.25,2.36),.13,C.stone,false);
  for(let x=37.2;x<=44.5;x+=2.3) {
    cylinder('wood',[x,1.79,41.35],.33,.33,.11,C.wood,18);
    for(const dz of [-.2,.2]) for(const dx of [-.2,.2]) rod('metal',[x+dx,1.08,41.35+dz],[x+dx*.8,1.75,41.35+dz*.8],.027,C.dark);
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
  // Three shallow overlapping courses follow the roof's existing curve, with no extra draw calls.
  for(const x of [32,40,48]) {
    const course:number[]=[],lip:number[]=[];
    for(let j=0;j<28;j++) {
      const z=41.8+j*26.4/28,z1=z+26.4/28;
      const a:V3=[x-.13,roofY(x-.13,z)+.055,z],b:V3=[x+.13,roofY(x+.13,z)+.055,z];
      const c:V3=[x+.13,roofY(x+.13,z1)+.055,z1],d:V3=[x-.13,roofY(x-.13,z1)+.055,z1];
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
      if(i%3===0) { const p=curve(i/22); cylinder('wood',p,.135,.135,.07,'#745833',8); }
    }
    for(const sign of [-1,1]) {
      rod('wood',[x,1.6,55+sign*11],[x,7.9,55+sign*10.5],.16,'#a77b3f',true);
      rod('wood',[x,3.7,55+sign*10.8],[x-2,7.1,55+sign*7.2],.1,'#bd9651',true);
      cylinder('wood',[x,1.75,55+sign*11],.28,.3,.3,C.edge,10);
    }
  }
  for(let z=42;z<=68;z+=2.15) rod('wood',[26,roofY(26,z)-.17,z],[50,roofY(50,z)-.17,z],.085,'#846236',true);
  for(let x=26;x<=50;x+=1.2) for(const sign of [-1,1]) {
    const z=55+sign*13.2; rod('wood',[x,roofY(x,z)-.15,z],[x+.6,roofY(x+.6,z)-.19,z],.09,'#87683b');
    // Sparse, visibly faceted fringe remains part of the roof silhouette.
    const fringe:V3[]=[[x,roofY(x,z),z],[x+.72,roofY(x+.72,z),z],[x+.63,roofY(x+.63,z)-.32,z+sign*.2],[x+.12,roofY(x+.12,z)-.25,z+sign*.22]];
    add('fabric',fromTriangles([...fringe[0],...fringe[1],...fringe[2],...fringe[0],...fringe[2],...fringe[3]]),'#ac884c');
  }
  // Bar roof repeats the same material language at a quieter scale.
  for(const sign of [-1,1]) {
    const z=40+sign*2.9;
    add('fabric',fromTriangles([35,4.5,z,46.5,5.7,40,35,5.7,40,35,4.5,z,46.5,4.5,z,46.5,5.7,40]),'#a58a50');
    rod('wood',[35,4.45,z],[46.5,4.45,z],.09,C.edge);
  }
  rod('wood',[35,5.65,40],[46.5,5.65,40],.1,C.edge);
  // Mirror ball suspension and bounded stage lamps attach to a real cross beam.
  rod('wood',[43.5,8.65,47],[43.5,8.65,63],.13,'#98713f',true);
  rod('metal',[43.5,8.65,55],[43.5,6.95,55],.018,C.dark);
  for(const z of [48,62]) {
    rod('metal',[43.5,8.5,z],[43.5,8.15,z],.035,C.dark);
    cylinder('metal',[43.5,8.05,z],.14,.2,.32,C.dark,12);
    cylinder(z<55?'amber':'cyan',[43.5,7.88,z],.13,.13,.018,z<55?C.amber:C.cyan,12);
  }
  // Small wicker lanterns and a single warm bar strip. They share two emissive batches.
  for(const [x,z,y] of [[28,44,3.1],[28,66,3.1],[47,44,3.1],[47,66,3.1],[37,39.6,3.7],[44,39.6,3.7],[65.3,44,1.8],[65.3,66,1.8]]) {
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
  // Low-poly palms: curved trunks, folded fronds and shared world wind. No grass-image billboards.
  for(const [cx,cz,h,phase] of [[27,39,7.8,.2],[27,70,9.1,1.8],[52,72,8.8,2.7],[67,40,9.6,.7],[70,64,8.5,2.1]]) {
    const top:V3=[cx+.6*Math.sin(phase),1+h,cz+.6*Math.cos(phase)];
    for(let i=0;i<7;i++) {
      const at=(t:number):V3=>[cx+.6*Math.sin(phase)*t*t,1+h*t,cz+.6*Math.cos(phase)*t*t];
      rod('wood',at(i/7),at((i+1)/7),.16-.065*i/7,i%2?'#74634a':'#857251',i<2);
    }
    for(let leaf=0;leaf<9;leaf++) {
      const a=leaf*TAU/9+phase,length=2.6+(leaf%3)*.28,positions:number[]=[];
      const p=(t:number,side:number):V3=>{ const w=.48*Math.sin(Math.PI*t)*(side?1:0),r=length*t; return [top[0]+Math.cos(a)*r+Math.sin(a)*w*side,top[1]+.6*Math.sin(t*Math.PI)-1.25*t*t+(side===0?.13:0),top[2]+Math.sin(a)*r-Math.cos(a)*w*side]; };
      for(let i=0;i<6;i++) { const t=i/6,u=(i+1)/6; for(const side of [-1,1]) positions.push(...p(t,0),...p(u,side),...p(t,side),...p(t,0),...p(u,0),...p(u,side)); }
      add('foliage',fromTriangles(positions),leaf%3?'#61724b':'#758052',.55);
    }
  }
  // Sparse agaves ground the pavilion corners; natural terrain still owns the surrounding grass.
  for(const [x,z] of [[29,41],[30,68],[48,69],[52,40],[67,46],[67,64]]) for(let i=0;i<9;i++) {
    const a=i*TAU/9,h=.65+(i%3)*.14,w=.18,tip:V3=[x+Math.cos(a)*.95,1+h,z+Math.sin(a)*.95];
    add('foliage',fromTriangles([x,1.04,z,x+Math.sin(a)*w,1.3,z-Math.cos(a)*w,...tip,x,1.04,z,...tip,x-Math.sin(a)*w,1.3,z+Math.cos(a)*w]),i%3?'#6f7e4a':'#859359',.35);
  }
  for(const z of [49,61]) {
    cylinder('wood',[67.5,2.6,z],.05,.065,2.6,C.edge,8);
    const umbrella=new CylinderGeometry(.05,1.65,.65,8,1,true); umbrella.translate(67.5,3.8,z); add('fabric',umbrella,'#c6b17d');
    box('wood',[67.5,1.42,z],[1.2,.16,2.4],C.edge); box('fabric',[67.5,1.6,z],[1.12,.19,2.3],'#43827e');
  }
  // Pool water has its own transparent draw, no support or side collider.
  const poolOutline=ellipse(57,55,7,10,1.35,72),water:number[]=[];
  for(let i=0;i<72;i++) water.push(57,1.35,55,...poolOutline[(i+1)%72],...poolOutline[i]);
  const pool=fromTriangles(water);
  return { batches: Object.fromEntries(Object.entries(batches).map(([key,batch])=>[key,batch.geometry()])) as Record<ClubBatch,BufferGeometry>, colliders: { surface: surface.data(), solid: solid.data() }, seats, pool };
}
