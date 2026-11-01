import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { coasterFrame, coasterWorld } from './coaster-track.ts';
import { onCoasterCliffWalk } from './coaster-landscape-cliffs.ts';
import { onCoasterInfieldWalk } from './coaster-terrain-relief.ts';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

export interface LandscapeRock {
  id: string;
  island: number;
  kind: 'bed' | 'shoulder' | 'spur' | 'cobble';
  position: Vec3;
  half: Vec3;
  hull: Float32Array;
}
// Retain the existing island anchors and rejected candidates. Sizes are horizontal radii.
export const LANDSCAPE_ROCK_SITES: readonly (readonly number[])[] = [
  [-43,-65,8,5.6,9],[-48,-9,5,2.7,8],[70,-81,9,6,12],[84,-57,7,5.8,9],
  [-36,13,5.8,2.4,5.8],[-25,47,7,2.4,6],[-44,43,7,2.8,8],
];
export const LANDSCAPE_ROCK_COLOURS=['#707c7c','#92958d','#b0ad9c','#9b9e94','#7e8580','#a4a497','#939b80'];

function clear(p:Vec3,half:Vec3,frames:ReturnType<typeof coasterFrame>[],margin=1.7) {
  if(onCoasterCliffWalk(p[0],p[2],Math.max(half[0],half[2])+2))return false;
  if(onCoasterInfieldWalk(p[0],p[2],Math.max(half[0],half[2])+1))return false;
  const world=new Vector3(...coasterWorld(p));
  return frames.every(f=>[f.point,f.point.clone().addScaledVector(f.up,2.2)].every(q=>
    Math.abs(q.x-world.x)>half[0]+margin||Math.abs(q.y-world.y)>half[1]+margin||Math.abs(q.z-world.z)>half[2]+margin));
}

const OUTLINES=[
  [[-.96,-.32],[-.57,-.91],[.24,-.98],[.94,-.49],[.86,.38],[.32,.94],[-.66,.77]],
  [[-.92,-.69],[-.12,-.97],[.79,-.63],[.97,.13],[.51,.92],[-.42,.84],[-.98,.19]],
  [[-.99,-.18],[-.65,-.82],[.39,-.93],[.96,-.14],[.63,.88],[-.18,.97],[-.78,.58]],
];
/** Broad roots, staggered shoulders and off-centre crests create fractured slabs.
 * All rings are input to one closed convex hull, shared with the physics emitter. */
function makeRock(id:string,island:number,kind:LandscapeRock['kind'],base:Vec3,radii:Vec3,seed:number):LandscapeRock {
  const [rx,height,rz]=radii,outline=OUTLINES[seed%OUTLINES.length],points:Vector3[]=[];
  const flank=kind==='spur'?.35:kind==='cobble'?.48:.69;
  for(let ring=0;ring<3;ring++)outline.forEach(([u,v],i)=>{
    const scale=ring===0?1:ring===1?.94:flank;
    const offset=ring===2?Math.sin(seed*1.9)*.16:0;
    const x=(u*scale+offset)*rx,z=(v*scale-offset*.6)*rz;
    const t=ring===0?0:ring===1?.38+.055*Math.sin(seed+i*2.1):.88+.08*u-.04*v;
    points.push(new Vector3(x,height*t,z));
  });
  const geometry=new ConvexGeometry(points),hull=new Float32Array(geometry.attributes.position.array);
  geometry.computeBoundingBox();
  const center=geometry.boundingBox!.getCenter(new Vector3());
  geometry.dispose();
  const half:Vec3=[0,0,0];
  for(let i=0;i<hull.length;i++) {
    hull[i]-=center.getComponent(i%3);
    half[i%3]=Math.max(half[i%3],Math.abs(hull[i]));
  }
  const position=base.map((v,i)=>v+center.getComponent(i)) as Vec3;
  return {id,island,kind,position,half,hull};
}

/** Four accepted islands remain broad, with lower overlapping shoulders rather than repeated pillars. */
export function landscapeRocks() {
  const frames=Array.from({length:900},(_,i)=>coasterFrame(i/900)),rocks:LandscapeRock[]=[],islands:number[]=[];
  LANDSCAPE_ROCK_SITES.forEach(([x,z,rx,h,rz],i)=>{
    if(!clear([x,h/2-.15,z],[rx*1.15,h/2,rz*1.15],frames,1.2))return;
    islands.push(i);
    const side=i%2===0?1:-1;
    rocks.push(makeRock(`island-${i}-bed`,i,'bed',[x-rx*.12*side,-.15,z-rz*.1],[rx*.79,h,rz*.78],i));
    rocks.push(makeRock(`island-${i}-shoulder`,i,'shoulder',[x+rx*.43*side,-.15,z+rz*.12],[rx*.5,h*(.57+.04*(i%3)),rz*.73],i+4));
    rocks.push(makeRock(`island-${i}-spur`,i,'spur',[x-rx*.25*side,-.15,z+rz*.57],[rx*.58,h*(.36+.04*(i%2)),rz*.4],i+8));
    for(let k=0;k<5;k++) {
      const angle=k*2.4+i,at:Vec3=[x+Math.cos(angle)*rx*.85,.7,z+Math.sin(angle)*rz*.85];
      if(!clear(at,[2.8,1.2,2.4],frames))continue;
      // Same centre and conservative envelope as the original loose stones; roots are buried.
      rocks.push(makeRock(`island-${i}-cobble-${k}`,i,'cobble',[at[0],-.18,at[2]],
        [2.5*(.87+.06*(k%3)),1.7+.15*(k%2),2.15*(.8+.09*((i+k)%3))],i*7+k+3));
    }
  });
  return {rocks,islands};
}

export function landscapeRockCollider(rock:LandscapeRock):CoasterCollider {
  return {position:coasterWorld(rock.position),half:rock.half,hull:rock.hull};
}

// Common tilted strata follow geology across each island's three overlapping solids.
const BED_LEVELS=[-Infinity,.38,1.12,1.26,2.65,2.82,Infinity];
function bedHeight(p:Vec3,island:number) {
  const [x,z]=LANDSCAPE_ROCK_SITES[island];
  return p[1]-.075*(p[0]-x)+.035*(p[2]-z);
}
function clip(polygon:Vec3[],level:number,above:boolean,island:number) {
  if(!Number.isFinite(level))return polygon;
  const out:Vec3[]=[];
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length],da=bedHeight(a,island)-level,db=bedHeight(b,island)-level;
    const ia=above?da>=0:da<=0,ib=above?db>=0:db<=0;
    if(ia)out.push(a);
    if(ia!==ib){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t) as Vec3);}
  });return out;
}

/** Colour cuts subdivide the canonical hull faces; no displacement or added shell. */
export function landscapeRockSurfaceParts(rock:LandscapeRock) {
  const faces=LANDSCAPE_ROCK_COLOURS.map(()=>[] as number[]),hull=rock.hull;
  for(let i=0;i<hull.length;i+=9) {
    const tri:Vec3[]=[0,3,6].map(j=>[hull[i+j]+rock.position[0],hull[i+j+1]+rock.position[1],hull[i+j+2]+rock.position[2]]);
    const normal=new Vector3(...tri[1]).sub(new Vector3(...tri[0])).cross(new Vector3(...tri[2]).sub(new Vector3(...tri[0]))).normalize();
    for(let layer=0;layer<BED_LEVELS.length-1;layer++) {
      const polygon=clip(clip(tri,BED_LEVELS[layer],true,rock.island),BED_LEVELS[layer+1],false,rock.island);
      const moss=rock.kind!=='cobble'&&normal.y>.8&&normal.x<-.2&&layer===5;
      const colour=moss?6:layer;
      for(let j=1;j<polygon.length-1;j++)faces[colour].push(...coasterWorld(polygon[0]),...coasterWorld(polygon[j]),...coasterWorld(polygon[j+1]));
    }
  }
  return faces.map((positions,i)=>{
    const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(positions),3));geometry.computeVertexNormals();
    return {geometry,colour:LANDSCAPE_ROCK_COLOURS[i]};
  });
}

export function addLandscapeRocks(steel:CoasterBatch,colliders:CoasterCollider[]) {
  const {rocks,islands}=landscapeRocks();
  for(const rock of rocks) {
    for(const {geometry,colour} of landscapeRockSurfaceParts(rock)) {
      if(geometry.attributes.position.count)steel.add(geometry,colour);else geometry.dispose();
    }
    colliders.push(landscapeRockCollider(rock));
  }
  return islands.length;
}
