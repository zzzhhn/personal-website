import type { Vec3 } from './types';

/** Shared world-space contract. Natural earth stays at y=1; raised timber floors belong to the club. */
export const CLUB = {
  center: [45, 1, 55] as Vec3,
  dance: [41, 1.6, 55] as Vec3,
  danceRadii: [8, 10] as [number, number],
  stage: [32, 2.0, 55] as Vec3,
  stageSize: [8, 14] as [number, number],
  stageFacing: [1, 0] as [number, number],
  console: [32.7, 3.0, 55] as Vec3,
  pool: [68, 1.35, 55] as Vec3,
  poolRadii: [17, 23] as [number, number],
  terrace: [89, 1.4, 56] as Vec3,
  entrance: [24, 1, 40] as Vec3,
  spawn: [30, 1.1, 39] as Vec3,
};

export const CLUB_CAPE = { center: [48, 61] as [number, number], radii: [48, 34] as [number, number], beachWidth: 8.5, shelfLength: 15 };
export const CLUB_APPROACH: Vec3[] = [CLUB.entrance, CLUB.spawn, [35, 1, 46]];
const TAU=Math.PI*2;
/** Broad, unequal headlands and coves, rather than a regular radial map block. */
export const clubCapeScale=(a:number)=>{
  // A northeast shoulder supports the pool promenade without filling the northern bay.
  const shoulder=Math.atan2(Math.sin(a+.93),Math.cos(a+.93));
  return 1+.095*Math.sin(3*a+.7)+.055*Math.cos(5*a-1.1)+.027*Math.sin(9*a+.4)+.19*Math.exp(-((shoulder/.3)**2));
};
export function clubCapeBoundary(a:number):[number,number] {
  const s=clubCapeScale(a);return [CLUB_CAPE.center[0]+CLUB_CAPE.radii[0]*s*Math.cos(a),CLUB_CAPE.center[1]+CLUB_CAPE.radii[1]*s*Math.sin(a)];
}
/** Radial signed distance in metres to the authored irregular cape, negative inland. */
export function clubCapeDistance(x: number, z: number) {
  const dx = x - CLUB_CAPE.center[0], dz = z - CLUB_CAPE.center[1];
  const q = Math.hypot(dx / CLUB_CAPE.radii[0], dz / CLUB_CAPE.radii[1]);
  const a=Math.atan2(dz/CLUB_CAPE.radii[1],dx/CLUB_CAPE.radii[0]);
  return q < 1e-9 ? -Math.min(...CLUB_CAPE.radii) : Math.hypot(dx, dz) * (1 - clubCapeScale(a) / q);
}

const poolScale=(a:number)=>1+.07*Math.sin(3*a+.4)+.045*Math.cos(5*a-.5);
export function clubPoolBoundary(a:number,outset=0):[number,number] {
  const s=poolScale(a),rx=CLUB.poolRadii[0]*s+outset,rz=CLUB.poolRadii[1]*s+outset;
  return [CLUB.pool[0]+rx*Math.cos(a),CLUB.pool[2]+rz*Math.sin(a)];
}
export function clubPoolDistance(x:number,z:number) {
  const dx=x-CLUB.pool[0],dz=z-CLUB.pool[2],q=Math.hypot(dx/CLUB.poolRadii[0],dz/CLUB.poolRadii[1]);
  return q<1e-8?-Math.min(...CLUB.poolRadii):Math.hypot(dx,dz)*(1-poolScale(Math.atan2(dz/CLUB.poolRadii[1],dx/CLUB.poolRadii[0]))/q);
}
const clamp01=(n:number)=>Math.max(0,Math.min(1,n));
function poolFloorHeight(x:number,z:number) {
  const d=clubPoolDistance(x,z);if(d>=0)return 1;
  const edge=clamp01(-d/3.4),blend=edge*edge*(3-2*edge);
  const shelf=.55+.28*clamp01((CLUB.pool[0]-x-1)/7);
  return 1-(1-shelf)*blend;
}
/** Shared geometry, terrain and interaction contract. Water itself is never a collider. */
export const CLUB_POOL={
  waterY:CLUB.pool[1],floorY:.55,segments:96,center:CLUB.pool,radii:CLUB.poolRadii,
  outline:Array.from({length:96},(_,i)=>clubPoolBoundary(i*TAU/96)),
  contains:(x:number,z:number)=>Math.abs(x-CLUB.pool[0])<CLUB.poolRadii[0]*1.12&&Math.abs(z-CLUB.pool[2])<CLUB.poolRadii[1]*1.12&&clubPoolDistance(x,z)<=0,
  distance:clubPoolDistance,floorHeight:poolFloorHeight,boundary:clubPoolBoundary,
};
export const CLUB_DAYBEDS:[number,number][]=[[62,42],[74,48],[78,66],[62,70]];
export const CLUB_PALMS:[number,number,number,number][]=[[25,36.5,7.8,.2],[27,70,9.1,1.8],[51,84,8.8,2.7],[83,30,9.6,.7],[94,62,8.5,2.1],[82,83,7.8,1.3]];
export const CLUB_SOFT_PLANTS:[number,number][]=[[26.3,46],[30,68],[47,78],[51.3,28],[87,37],[91,72],[60,86],[95,54]];
export const CLUB_WALKWAYS:[number,number][][]=[-1,1].map(sign=>{
  const from:[number,number]=[41,55+sign*9],to=clubPoolBoundary(sign*2.12,1.6),dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz);
  const points=[from,[from[0]+dx*.62,from[1]+dz*.62],to] as [number,number][];
  const edge=(p:[number,number],side:number):[number,number]=>[p[0]-dz/length*1.9*side,p[1]+dx/length*1.9*side];
  return [...points.map(p=>edge(p,1)),...points.slice().reverse().map(p=>edge(p,-1))];
});
/** Lighting and visible lanterns share the same placement. No invisible light grid. */
export const CLUB_LANTERNS:[number,number,number][]=[[28,3.1,44],[28,3.1,66],[47,3.1,44],[47,3.1,66],[37,3.7,39.6],[44,3.7,39.6],
  ...Array.from({length:10},(_,i)=>{const [x,z]=clubPoolBoundary(i*TAU/10,.95);return[x,1.95,z] as [number,number,number];})];
const inPolygon=(x:number,z:number,p:[number,number][])=>{let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
export function clubScatterBlocked(x:number,z:number) {
  if(x<20||x>105||z<20||z>96)return false;
  if(clubPoolDistance(x,z)<6.2)return true;
  if(Math.hypot((x-CLUB.dance[0])/8.5,(z-CLUB.dance[2])/10.5)<1)return true;
  return CLUB_SCATTER_BLOCKERS.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ)||CLUB_WALKWAYS.some(p=>inPolygon(x,z,p));
}

/** Hard surfaces and circulation only; cape shoulders retain living grass. */
export const CLUB_SCATTER_BLOCKERS = [
  { minX: 27.4, maxX: 36.6, minZ: 47.4, maxZ: 62.6 }, // raised stage
  { minX: 22.8, maxX: 30.5, minZ: 38.7, maxZ: 44.6 }, // shore entrance
  { minX: 28, maxX: 36.5, minZ: 41.6, maxZ: 47.3 }, // approach to timber floors
  { minX: 35, maxX: 46.5, minZ: 37.5, maxZ: 42.7 }, // bar and stools
];

/** Exact intersections with the final terrain triangles, stitched by mesh-edge identity.
 * Unlike a radial silhouette, these closed loops retain bays and separate land masses. */
export function meshWaterlineLoops(positions: ArrayLike<number>, indices: ArrayLike<number>, waterY: number): [number, number][][] {
  const points = new Map<string, [number, number]>(), adjacent = new Map<string, string[]>();
  const crossing = (a: number, b: number) => {
    const ya = positions[a * 3 + 1], yb = positions[b * 3 + 1];
    if ((ya > waterY) === (yb > waterY)) return null;
    const key = Math.abs(ya - waterY) < 1e-10 ? `v${a}` : Math.abs(yb - waterY) < 1e-10 ? `v${b}` : `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!points.has(key)) {
      const t = (waterY - ya) / (yb - ya);
      points.set(key, [positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t, positions[a * 3 + 2] + (positions[b * 3 + 2] - positions[a * 3 + 2]) * t]);
    }
    return key;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const keys = [...new Set([crossing(a, b), crossing(b, c), crossing(c, a)].filter((p): p is string => p !== null))];
    if (keys.length !== 2) continue;
    for (const [from, to] of [[keys[0], keys[1]], [keys[1], keys[0]]]) {
      const list = adjacent.get(from) ?? []; if (!list.includes(to)) list.push(to); adjacent.set(from, list);
    }
  }
  const used = new Set<string>(), loops: [number, number][][] = [];
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const [start, neighbours] of adjacent) for (const first of neighbours) {
    if (used.has(edgeKey(start, first))) continue;
    const loop: [number, number][] = [points.get(start)!];
    let previous = start, current = first;
    used.add(edgeKey(previous, current));
    while (current !== start) {
      loop.push(points.get(current)!);
      const next = adjacent.get(current)?.find(k => k !== previous && !used.has(edgeKey(current, k)));
      if (!next) break;
      previous = current; current = next; used.add(edgeKey(previous, current));
    }
    if (current === start && loop.length > 2) loops.push(loop);
  }
  const area = (p: [number, number][]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
  return loops.sort((a, b) => area(b) - area(a));
}
