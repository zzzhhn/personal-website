import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import { coasterFrame, coasterRidePose, coasterSupports, coasterWorld, COASTER_LENGTH } from './coaster-track.ts';
import { bakeIntentNight } from './intent-lighting.ts';
import { lightCoasterCliffs } from './coaster-landscape-lighting.ts';
import type { CoasterBatch } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

type Point2 = readonly [number, number];
export interface CoasterReliefFormation {
  id: string;
  center: Point2;
  height: number;
  /** Counter-clockwise in x/z; the shared perimeter is resampled, never scattered. */
  outline: readonly Point2[];
  equipmentShelf?: boolean;
}

/** Three connected mineral landforms, kept north of all public walking routes. */
export const COASTER_RELIEF_FORMATIONS: readonly CoasterReliefFormation[] = [
  { id: 'tower-back-ridge', center: [-26, -108], height: 9.2,
    outline: [[-51,-109],[-47,-117],[-33,-122],[-17,-121],[0,-117],[16,-110],[16,-101],[-3,-101],[-17,-103],[-30,-96],[-44,-87],[-51,-96]] },
  { id: 'equipment-shelf', center: [24, -92], height: 5, equipmentShelf: true,
    outline: [[4,-97],[9,-109],[23,-110],[35,-106],[42,-98],[40,-86],[34,-77],[23,-75],[12,-81],[4,-88]] },
  { id: 'inversion-inner-ridge', center: [44, -70], height: 8.2,
    outline: [[30,-77],[34,-85],[43,-89],[52,-84],[57,-75],[56,-64],[50,-54],[42,-51],[34,-57],[29,-67]] },
];

/** Broad connected folds behind the v4 loops. The eastern shoulder ends before
 * the retained water-roll bay (x≈122,z≈-25), rather than filling that inlet. */
export const COASTER_THRILL_RELIEF = [
  { id: 'thrill-north-escarpment', height: 13.4,
    outline: [[-65,-169],[-59,-183],[-38,-190],[-12,-184],[17,-177],[44,-169],[48,-151],[27,-138],[7,-135],[-14,-121],[-35,-118],[-49,-131],[-47,-163]],
    folds: [[-38,-177,12,19,11],[-9,-166,13.4,24,12],[17,-146,10,19,13]],
    shrubs: [[-42,-178],[-24,-174],[-11,-167],[0,-143],[14,-142]] },
  { id: 'thrill-northeast-spine', height: 15.2,
    outline: [[30,-165],[48,-184],[76,-204],[101,-207],[123,-190],[133,-166],[126,-143],[112,-125],[97,-103],[79,-88],[58,-90],[42,-110],[38,-139]],
    folds: [[78,-189,15.2,25,12],[93,-157,13.5,22,21],[73,-122,10.8,21,23]],
    shrubs: [[60,-178],[78,-187],[100,-177],[91,-148],[81,-115],[64,-104]] },
  { id: 'thrill-east-shoulder', height: 11.8,
    outline: [[110,-159],[131,-170],[152,-164],[166,-145],[170,-121],[165,-96],[156,-69],[144,-45],[127,-43],[116,-57],[109,-83],[96,-111]],
    folds: [[143,-143,11.8,18,23],[145,-106,9.8,17,21],[134,-67,7.4,16,18]],
    shrubs: [[145,-145],[153,-128],[145,-105],[131,-87],[137,-59]] },
] as const;

// Fractures run vertically through uneven beds; there are no continuous coloured
// bands or repeated terrace offsets. Palette changes follow the rock columns.
const PALETTE = ['#77817e', '#92988b', '#aba994', '#8b9489', '#6f7c70', '#7e885b', '#92966b', '#63754d', '#496344', '#657d46', '#819152', '#b6aa8e'];
const fracture = (x: number, z: number, seed: number) => Math.sin(x * .71 + z * .39 + seed) * .55 + Math.cos(x * .29 - z * .64 + seed) * .45;
const INFIELD_ROCK = new Color('#929487'), INFIELD_MOSS = new Color('#7d875c');
function infieldColor(a: Vec3, b: Vec3, c: Vec3) {
  const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const slope=Math.hypot(nx,nz)/Math.max(1e-6,Math.abs(ny));
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;
  // Broad connected mineral/moss patches; no per-cell palette jumps. Flat normals still provide facets.
  const patch=fracture(x*.12,z*.12,4), moss=Math.max(0,Math.min(.8,.78-slope*.9+patch*.09));
  return INFIELD_ROCK.clone().lerp(INFIELD_MOSS,moss).multiplyScalar(1+patch*.045);
}

export const COASTER_INFIELD_OUTLINE: readonly Point2[] = [[-29,-70],[-12,-73],[7,-66],[23,-59],[40,-58],[50,-47],[46,-29],[49,-17],[43,4],[43,25],[36,40],[20,44],[14,37],[14,23],[-9,15],[-23,4],[-25,-20],[-29,-43]];
/** Closed gentle garden loop, attached to the existing x=16 promenade at its first node. */
export const COASTER_INFIELD_WALK: readonly Vec3[] = [[16,.11,36],[25,1,34],[34,2.8,24],[32,3,16],[23,1.8,16],[17,.6,26]];
export const COASTER_INFIELD_LAMPS: readonly Point2[] = [[27,38],[37,24],[31,12],[19,18]];

function walkSample(x: number, z: number) {
  let distance = Infinity, height = 0;
  COASTER_INFIELD_WALK.forEach((a, i) => {
    const b = COASTER_INFIELD_WALK[(i+1)%COASTER_INFIELD_WALK.length], dx=b[0]-a[0], dz=b[2]-a[2];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
    if(d<distance){distance=d;height=a[1]+(b[1]-a[1])*t;}
  });
  return {distance,height};
}
export const onCoasterInfieldWalk = (x:number,z:number,margin=0) => walkSample(x,z).distance < 2.1+margin;

// Spatially binned ceiling samples constrain the land, never the existing ride.
let clearanceBins: Map<string, Vec3[]> | undefined;
function safetyCeiling(x:number,z:number) {
  if(!clearanceBins){
    clearanceBins=new Map();
    const add=(wx:number,wy:number,wz:number,margin:number)=>{
      const p:Vec3=[wx-50,wy-1-margin,wz+195],key=`${Math.floor(p[0]/8)},${Math.floor(p[2]/8)}`;
      const bucket=clearanceBins!.get(key)??[];bucket.push(p);clearanceBins!.set(key,bucket);
    };
    const count=Math.ceil(COASTER_LENGTH/.7);
    for(let i=0;i<count;i++){
      const f=coasterFrame(i/count);
      for(const up of [-.45,.8,2.2]){const p=f.point.clone().addScaledVector(f.up,up);add(p.x,p.y,p.z,2.25);}
      for(const view of ['chase','comfort'] as const){
        const pose=coasterRidePose(i/count,view),a=pose.cameraPosition,b=pose.cameraTarget;
        const steps=Math.ceil(Math.hypot(...a.map((v,k)=>v-b[k]))/1.5);
        for(let j=0;j<=steps;j++){const t=j/steps;add(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,.7);}
      }
    }
  }
  let ceiling=Infinity;
  for(let bx=Math.floor(x/8)-1;bx<=Math.floor(x/8)+1;bx++)for(let bz=Math.floor(z/8)-1;bz<=Math.floor(z/8)+1;bz++)
    for(const p of clearanceBins.get(`${bx},${bz}`)??[])if(Math.hypot(x-p[0],z-p[2])<6.2)ceiling=Math.min(ceiling,p[1]);
  return ceiling;
}

let foundationFeet: Point2[] | undefined;
/** Depress the same solid terrain around BOTH support LODs. A six metre low
 * apron also protects triangle interiors on the five metre relief grid. */
function foundationCeiling(x:number,z:number) {
  if(!foundationFeet)foundationFeet=[true,false].flatMap(detailed=>coasterSupports(detailed)
    .flatMap(({a,b})=>[a,b].map(p=>[p.x-50,p.z+195] as Point2)));
  let ceiling=Infinity;
  for(const [fx,fz] of foundationFeet){
    const distance=Math.hypot(x-fx,z-fz);
    if(distance<12)ceiling=Math.min(ceiling,.04+Math.max(0,distance-6)*1.7);
  }
  // The main tower is an independent four-legged structure, outside the
  // sampled track supports. Preserve its entire concrete apron at ground level.
  const towerDistance=Math.hypot(Math.max(0,-55-x,x+33),Math.max(0,-159-z,z+141));
  if(towerDistance<12)ceiling=Math.min(ceiling,.04+Math.max(0,towerDistance-6)*1.7);
  return ceiling;
}

export function coasterThrillReliefCeiling(x:number,z:number) {
  return Math.min(safetyCeiling(x,z),foundationCeiling(x,z));
}

function edgeDistance(outline:readonly Point2[],x:number,z:number) {
  let edge=Infinity;
  outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    edge=Math.min(edge,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));});
  return edge;
}

function thrillReliefHeight(formation:typeof COASTER_THRILL_RELIEF[number],x:number,z:number) {
  const fold=Math.max(...formation.folds.map(([rx,rz,h,wx,wz])=>h*Math.exp(-(((x-rx)/wx)**2+((z-rz)/wz)**2))));
  const broken=.45+fold+fracture(x*.27,z*.27,7)*.8;
  const height=.04+(broken-.04)*Math.min(1,edgeDistance(formation.outline,x,z)/8);
  return Math.max(-.45,Math.min(height,coasterThrillReliefCeiling(x,z)));
}

const ridges: readonly (readonly [number,number,number,number])[] = [
  [-22,-62,7.6,14],[-18,-40,10,14],[-14,-18,6.4,13],[7,-54,10.5,16],
  [13,-31,7.5,17],[26,-15,8.4,15],[40,-42,9,12],[40,-17,7.8,13],[33,5,6.5,16],[30,26,5.8,15],
];
function infieldHeight(x:number,z:number) {
  const fold=Math.max(...ridges.map(([rx,rz,h,width])=>h*Math.exp(-((x-rx)**2+(z-rz)**2)/(width*width))));
  let y=.35+fold+fracture(x*.32,z*.32,3)*.65;
  let edge=Infinity;
  COASTER_INFIELD_OUTLINE.forEach((a,i)=>{const b=COASTER_INFIELD_OUTLINE[(i+1)%COASTER_INFIELD_OUTLINE.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));edge=Math.min(edge,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));});
  y=.04+(y-.04)*Math.min(1,edge/7);
  const walk=walkSample(x,z);
  if(walk.distance<5.4)y=Math.min(y,walk.height-.26+Math.max(0,walk.distance-3.3)*.38);
  // At low track crossings this becomes a shallow cutting, joining the retained grass at its edges.
  return Math.max(-.45,Math.min(y,safetyCeiling(x,z)));
}

type InfieldSurface = { points: Vec3[]; faces: [number,number,number][]; cells: Map<string,number[]> };
let infieldSurface: InfieldSurface | undefined;
function clippedSurface(outline:readonly Point2[],step:number,height:(x:number,z:number)=>number) {
  const points:Vec3[]=[],faces:[number,number,number][]=[],cells=new Map<string,number[]>(),lookup=new Map<string,number>();
  const vertex=(x:number,z:number)=>{const key=`${Math.round(x*1e5)},${Math.round(z*1e5)}`;let i=lookup.get(key);if(i===undefined){i=points.length;lookup.set(key,i);points.push([x,height(x,z),z]);}return i;};
  const clip=(poly:Point2[],axis:0|1,value:number,positive:boolean)=>{
    const out:Point2[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],aa=positive?a[axis]>=value:a[axis]<=value,bb=positive?b[axis]>=value:b[axis]<=value;
      if(aa)out.push(a);
      if(aa!==bb){const t=(value-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    return out.filter((p,i)=>!i||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>1e-6);
  };
  // Clip convex pieces, not the concave outline itself: a concave clipping result can
  // contain a zero-width bridge that a centre fan would incorrectly fill with faces.
  const pieces=ShapeUtils.triangulateShape(outline.map(p=>new Vector2(...p)),[])
    .map(ids=>ids.map(i=>outline[i]));
  const minX=Math.floor(Math.min(...outline.map(p=>p[0]))/step)*step,maxX=Math.max(...outline.map(p=>p[0]));
  const minZ=Math.floor(Math.min(...outline.map(p=>p[1]))/step)*step,maxZ=Math.max(...outline.map(p=>p[1]));
  for(let x=minX;x<maxX;x+=step)for(let z=minZ;z<maxZ;z+=step){
    // Keep the retained ground exposed below the lowest rail sections.
    if([[x,z],[x+step,z],[x,z+step],[x+step,z+step]].some(([px,pz])=>safetyCeiling(px,pz)<.1))continue;
    const list:number[]=[];
    for(const piece of pieces){
    let poly:Point2[]=[...piece];
    for(const [axis,value,positive] of [[0,x,true],[0,x+step,false],[1,z,true],[1,z+step,false]] as const)poly=clip(poly,axis,value,positive);
    if(poly.length>2&&Math.hypot(poly[0][0]-poly.at(-1)![0],poly[0][1]-poly.at(-1)![1])<1e-6)poly.pop();
    if(poly.length<3)continue;
    const area=poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-b[0]*a[1];},0);
    if(Math.abs(area)<1e-5)continue;
    const centre=vertex(poly.reduce((s,p)=>s+p[0],0)/poly.length,poly.reduce((s,p)=>s+p[1],0)/poly.length);
    poly.forEach((a,i)=>{list.push(faces.length);faces.push([centre,vertex(...poly[(i+1)%poly.length]),vertex(...a)]);});
    }
    if(list.length)cells.set(`${x},${z}`,list);
  }
  return {points,faces,cells};
}
function getInfieldSurface() {
  return infieldSurface??=clippedSurface(COASTER_INFIELD_OUTLINE,3,infieldHeight);
}

/** Exact barycentric top surface, also used to seat vegetation on the collision mesh. */
export function coasterInfieldHeight(x:number,z:number) {
  const mesh=getInfieldSurface(),ids=mesh.cells.get(`${Math.floor(x/3)*3},${Math.floor(z/3)*3}`)??[];
  for(const i of ids){
    const [a,b,c]=mesh.faces[i].map(v=>mesh.points[v]);
    const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return u*a[1]+v*b[1]+(1-u-v)*c[1];
  }
  return null;
}

function perimeter(outline: readonly Point2[]) {
  const result: Point2[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length], count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.7);
    for (let step = 0; step < count; step++) result.push([a[0] + (b[0] - a[0]) * step / count, a[1] + (b[1] - a[1]) * step / count]);
  });
  return result;
}

/** Only baked diffuse spill from the already modelled tower and equipment fixtures. */
function bakeReliefSpill(g: BufferGeometry) {
  const sources = [
    { at: coasterWorld([-41.5, 10.1, -72.35]), radius: 42, power: 1.15, tint: new Color('#ffd29a') },
    { at: coasterWorld([24, 7.1, -85.42]), radius: 29, power: 1.8, tint: new Color('#ffd29a') },
    { at: coasterWorld([24, 11.8, -87.86]), radius: 34, power: .9, tint: new Color('#69c6ce') },
    ...COASTER_INFIELD_LAMPS.map(([x,z])=>({at:coasterWorld([x,(coasterInfieldHeight(x,z)??0)+2.8,z]),radius:16,power:2.7,tint:new Color('#ffd29a')})),
  ];
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color'), fill = g.getAttribute('nightRadiance');
  for (let i = 0; i < p.count; i++) for (const s of sources) {
    const dx = s.at[0] - p.getX(i), dy = s.at[1] - p.getY(i), dz = s.at[2] - p.getZ(i), distance = Math.hypot(dx, dy, dz);
    if (distance >= s.radius) continue;
    const facing = Math.max(.04, (dx * n.getX(i) + dy * n.getY(i) + dz * n.getZ(i)) / Math.max(.01, distance));
    const strength = (1 - distance / s.radius) ** 2 * facing * s.power;
    fill.setXYZ(i, fill.getX(i) + c.getX(i) * s.tint.r * strength,
      fill.getY(i) + c.getY(i) * s.tint.g * strength, fill.getZ(i) + c.getZ(i) * s.tint.b * strength);
  }
}

export function createCoasterTerrainRelief() {
  const vertices: number[] = [], indices: number[] = [], shades: (number | Color)[] = [];
  let shrubCount = 0;
  const formations: { id: string; firstTriangle: number; triangleCount: number; vertexStart: number; vertexCount: number; terrainTriangleCount?: number }[] = [];
  const vertex = (p: Vec3) => { const index = vertices.length / 3; vertices.push(...coasterWorld(p)); return index; };
  const face = (a: number, b: number, c: number, shade: number | Color) => { indices.push(a, b, c); shades.push(shade); };
  const groundAt = (x: number,z: number,firstTriangle: number,lastTriangle: number) => {
    const [wx,,wz]=coasterWorld([x,0,z]);let highest=-Infinity;
    for(let t=firstTriangle;t<lastTriangle;t++) {
      const [a,b,c]=indices.slice(t*3,t*3+3).map(i=>vertices.slice(i*3,i*3+3));
      const determinant=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      if(Math.abs(determinant)<1e-7)continue;
      const u=((b[2]-c[2])*(wx-c[0])+(c[0]-b[0])*(wz-c[2]))/determinant;
      const v=((c[2]-a[2])*(wx-c[0])+(a[0]-c[0])*(wz-c[2]))/determinant;
      if(u>=0&&v>=0&&u+v<=1)highest=Math.max(highest,u*a[1]+v*b[1]+(1-u-v)*c[1]-1);
    }
    return highest;
  };
  const shrub = (x:number,y:number,z:number,seed:number) => {
    const start=vertices.length/3,radius=1.15+Math.sin(seed)*.2;
    for(let ring=0;ring<2;ring++)for(let i=0;i<5;i++){
      const angle=i*Math.PI*2/5+seed*.7,rad=radius*(ring===0?.72:1)*(1+Math.sin(i*2+seed)*.13);
      vertex([x+Math.cos(angle)*rad,y+(ring===0?-.18:.68+Math.cos(i+seed)*.13),z+Math.sin(angle)*rad]);
    }
    const bottom=vertex([x,y-.2,z]),top=vertex([x+.2,y+1.45+Math.sin(seed)*.2,z-.15]);
    for(let i=0;i<5;i++){
      const j=(i+1)%5,shade=8+(i+seed)%3;
      face(start+i,start+i+5,start+j+5,shade);face(start+i,start+j+5,start+j,shade);
      face(bottom,start+i,start+j,8);face(top,start+j+5,start+i+5,shade);
    }
    shrubCount++;
  };
  const connect = (lower: number, upper: number, count: number, seed: number, crown = false) => {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count, a = lower + i, b = lower + j, c = upper + j, d = upper + i;
      const x = vertices[a * 3], z = vertices[a * 3 + 2];
      const mineral = Math.floor(Math.abs(fracture(x * .3, z * .3, seed)) * 7) % 5;
      const patch = crown && Math.sin(x * .21 + z * .17) + Math.cos(z * .31) > .7;
      const shade = patch ? 5 + i % 3 : mineral;
      if ((i + seed) % 2) { face(a,d,b,shade); face(b,d,c,shade); }
      else { face(a,d,c,shade); face(a,c,b,shade); }
    }
  };
  for (const [formationIndex, formation] of COASTER_RELIEF_FORMATIONS.entries()) {
    const edge = perimeter(formation.outline), count = edge.length, start = vertices.length / 3, firstTriangle = indices.length / 3;
    const [cx, cz] = formation.center;
    const rings = [0,.12,.39,.72,1];
    for (const [ring, fraction] of rings.entries()) edge.forEach(([x,z]) => {
      const crack = fracture(x,z,formationIndex), bedShift = Math.sin(x * .18 + z * .08) * .075;
      const height = formation.height * (formation.equipmentShelf ? .77 + crack * .18 : .93 + crack * .16 + Math.sin(x * .14) * .09);
      // A continuous vertical notch, skewed along the strata, breaks the outer wall.
      const notch = Math.max(0, Math.cos((x-z*.42)*.72)) ** 8 * .065;
      const scale = ring === 0 ? 1 : 1 - fraction * (formation.equipmentShelf ? .08 : .15) - notch*fraction + crack * Math.sin(fraction*Math.PI) * .055;
      const y = ring === 0 ? -.85 : height * (fraction + bedShift*Math.sin(fraction*Math.PI));
      vertex([cx+(x-cx)*scale,y,cz+(z-cz)*scale]);
    });
    for(let ring=0;ring<rings.length-1;ring++)connect(start+ring*count,start+(ring+1)*count,count,formationIndex);
    const rim = start+(rings.length-1)*count;
    if (formation.equipmentShelf) {
      // Triangulate a shoulder around an exact flat rectangular support. A variable
      // rim must never interpolate through the required 15 x 13 m equipment base.
      const pad: Point2[] = [[16.1,-98.9],[16.1,-85.1],[31.9,-85.1],[31.9,-98.9]];
      const padStart=vertices.length/3;
      pad.forEach(([x,z])=>vertex([x,5,z]));
      const outer=Array.from({length:count},(_,i)=>new Vector2(vertices[(rim+i)*3],vertices[(rim+i)*3+2]));
      const hole=pad.map(([x,z])=>new Vector2(x+50,z-195));
      const map=[...Array.from({length:count},(_,i)=>rim+i),...pad.map((_,i)=>padStart+i)];
      for(const [a,b,c] of ShapeUtils.triangulateShape(outer,[hole]))face(map[a],map[c],map[b],1+(a%3));
      face(padStart,padStart+1,padStart+2,2);face(padStart,padStart+2,padStart+3,2);
    } else {
      let previous=rim;
      for(const scale of [.57,.29]) {
        const next=vertices.length/3;
        edge.forEach(([x,z],i)=>{
          const skew=fracture(x,z,formationIndex+2), dx=x-cx,dz=z-cz;
          const atX=cx+dx*scale+Math.sin(i*.83)*.6,atZ=cz+dz*scale+Math.cos(i*.79)*.6;
          const y=formation.height*(.96+fracture(atX,atZ,formationIndex)*.12)+skew*.4;
          vertex([atX,y,atZ]);
        });
        connect(previous,next,count,formationIndex,true);previous=next;
      }
      const summit=vertex([cx,formation.height*1.02,cz]);
      for(let i=0;i<count;i++)face(summit,previous+(i+1)%count,previous+i,i%4===0?5:1+i%3);
    }
    const bottom = vertex([cx, -.85, cz]);
    for (let i = 0; i < count; i++) {
      face(bottom, start + i, start + (i+1)%count, 0);
    }
    const terrainEnd=indices.length/3;
    const clusters: Point2[][] = [[[-36,-108],[-20,-111],[-4,-109]],[[13,-92],[35,-97]],[[38,-73],[45,-65],[47,-79]]];
    for(const [clusterIndex,[x,z]] of clusters[formationIndex].entries())for(let lobe=0;lobe<3;lobe++){
      const px=x+(lobe-1)*1.1,pz=z+(lobe===1?.65:-.25),y=groundAt(px,pz,firstTriangle,terrainEnd);
      if(Number.isFinite(y))shrub(px,y,pz,formationIndex*12+clusterIndex*3+lobe);
    }
    formations.push({ id: formation.id, firstTriangle, triangleCount: indices.length / 3 - firstTriangle, vertexStart: start, vertexCount: vertices.length / 3 - start });
  }
  // One connected infield terrain surface, closed beneath the ground. Its grid is clipped
  // to the authored irregular boundary and its ridges are cut by the unchanged ride envelope.
  const infield=getInfieldSurface(),firstTriangle=indices.length/3,vertexStart=vertices.length/3;
  const solidTop=(points:Vec3[],faces:[number,number,number][],shade:(a:Vec3,b:Vec3,c:Vec3)=>number|Color)=>{
    const top=points.map(vertex),bottom=points.map(([x,,z])=>vertex([x,-.85,z]));
    const edges=new Map<string,{a:number;b:number;count:number}>();
    for(const [a,b,c] of faces){
      face(top[a],top[b],top[c],shade(points[a],points[b],points[c]));face(bottom[a],bottom[c],bottom[b],0);
      for(const [u,v] of [[a,b],[b,c],[c,a]]){const key=[Math.min(u,v),Math.max(u,v)].join(':');const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a:u,b:v,count:1});}
    }
    for(const {a,b,count} of edges.values())if(count===1){face(top[b],top[a],bottom[a],3);face(top[b],bottom[a],bottom[b],3);}
  };
  solidTop(infield.points,infield.faces,infieldColor);
  const terrainEnd=indices.length/3;
  // This loop has no decorative dead end: the first junction shares the original public promenade.
  const walkPoints:Vec3[]=[],walkFaces:[number,number,number][]=[];
  COASTER_INFIELD_WALK.forEach((p,i)=>{
    const before=COASTER_INFIELD_WALK[(i+COASTER_INFIELD_WALK.length-1)%COASTER_INFIELD_WALK.length],after=COASTER_INFIELD_WALK[(i+1)%COASTER_INFIELD_WALK.length];
    const a=new Vector2(p[0]-before[0],p[2]-before[2]).normalize(),b=new Vector2(after[0]-p[0],after[2]-p[2]).normalize();
    const normal=new Vector2(-a.y,a.x).add(new Vector2(-b.y,b.x)).normalize();
    const width=1.8/Math.max(.45,normal.dot(new Vector2(-b.y,b.x)));
    for(const side of [-1,1])walkPoints.push([p[0]+normal.x*width*side,p[1],p[2]+normal.y*width*side]);
  });
  for(let i=0;i<COASTER_INFIELD_WALK.length;i++){
    const next=(i+1)%COASTER_INFIELD_WALK.length;
    for(const tri of [[i*2,next*2,i*2+1],[i*2+1,next*2,next*2+1]] as [number,number,number][]){
      const [a,b,c]=tri.map(v=>walkPoints[v]);if((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])>0)[tri[1],tri[2]]=[tri[2],tri[1]];walkFaces.push(tri);
    }
  }
  solidTop(walkPoints,walkFaces,()=>11);
  const clusters:Point2[]=[[-20,-60],[-19,-46],[-15,-27],[-10,-14],[5,-56],[10,-33],[19,-28],[29,-22],[37,-41],[41,-20],[36,-4],[32,4],[39,28],[29,39]];
  clusters.forEach(([x,z],i)=>{for(let lobe=0;lobe<4;lobe++){
    const px=x+(lobe%2?1.4:-1.4),pz=z+(lobe<2?-.8:.8),y=groundAt(px,pz,firstTriangle,terrainEnd);
    if(Number.isFinite(y)&&!onCoasterInfieldWalk(px,pz,2)&&y+1.7<safetyCeiling(px,pz))shrub(px,y,pz,60+i*4+lobe);
  }});
  formations.push({id:'infield-folds',firstTriangle,triangleCount:indices.length/3-firstTriangle,vertexStart,vertexCount:vertices.length/3-vertexStart});
  for(const formation of COASTER_THRILL_RELIEF){
    const firstTriangle=indices.length/3,vertexStart=vertices.length/3;
    const surface=clippedSurface(formation.outline,5,(x,z)=>thrillReliefHeight(formation,x,z));
    solidTop(surface.points,surface.faces,infieldColor);
    const terrainEnd=indices.length/3;
    formation.shrubs.forEach(([x,z],cluster)=>{for(let lobe=0;lobe<3;lobe++){
      const px=x+(lobe-1)*1.1,pz=z+(lobe===1?.65:-.25),y=groundAt(px,pz,firstTriangle,terrainEnd);
      // The complete canopy footprint, not only its root, stays below the ride
      // and away from support aprons; all lobes are seated on the actual mesh.
      const ceiling=Math.min(...[[0,0],[-1.5,0],[1.5,0],[0,-1.5],[0,1.5]]
        .map(([dx,dz])=>coasterThrillReliefCeiling(px+dx,pz+dz)));
      if(Number.isFinite(y)&&y>1.5&&y+1.8<ceiling)shrub(px,y,pz,120+cluster*3+lobe);
    }});
    formations.push({id:formation.id,firstTriangle,terrainTriangleCount:terrainEnd-firstTriangle,
      triangleCount:indices.length/3-firstTriangle,vertexStart,vertexCount:vertices.length/3-vertexStart});
  }
  const collision = { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  const positions = new Float32Array(indices.length * 3), colors = new Float32Array(positions.length), palette = PALETTE.map(c => new Color(c));
  indices.forEach((index, i) => {
    positions.set(collision.vertices.subarray(index * 3, index * 3 + 3), i * 3);
    const shade=shades[Math.floor(i/3)];
    colors.set((typeof shade==='number'?palette[shade]:shade).toArray(),i*3);
  });
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3)).setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  bakeIntentNight(geometry); lightCoasterCliffs(geometry); bakeReliefSpill(geometry);
  return { geometry, ...collision, formations, shrubCount, triangleCount: indices.length / 3 };
}

/** Appends one vertex-colour batch; collision uses the exact same world-space faces. */
export function addCoasterTerrainRelief(batch: CoasterBatch) {
  const { geometry, ...relief } = createCoasterTerrainRelief();
  batch.parts.push(geometry);
  return relief;
}
