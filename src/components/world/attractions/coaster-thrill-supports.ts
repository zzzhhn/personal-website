import { Vector3 } from 'three';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import { thrillFrame, thrillRidePose } from './coaster-thrill-frame.ts';
import { attractionCapeDistance } from './attraction-layout.ts';
import { PointClearanceIndex } from './coaster-clearance-index.ts';
import { inCoasterStructureSample } from './coaster-rail-section.ts';

export interface ThrillBeam { a: Vector3; b: Vector3; radius: number }
export interface ThrillSupport { a: Vector3; b: Vector3; top: Vector3; beams: ThrillBeam[]; u: number }
export const coasterSupportBase=(x:number,z:number)=>attractionCapeDistance(x,z)>0?-9:1;
export function pointSegmentDistance(p: Vector3, a: Vector3, b: Vector3) {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/Math.max(1e-9,x*x+y*y+z*z)));
  return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t,p.z-a.z-z*t);
}
const cache = new Map<boolean, ThrillSupport[]>();
function segmentsDistance(a:Vector3,b:Vector3,c:Vector3,d:Vector3) {
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=d.x-c.x,vy=d.y-c.y,vz=d.z-c.z;
  const wx=a.x-c.x,wy=a.y-c.y,wz=a.z-c.z,A=ux*ux+uy*uy+uz*uz,B=ux*vx+uy*vy+uz*vz,C=vx*vx+vy*vy+vz*vz,D=ux*wx+uy*wy+uz*wz,E=vx*wx+vy*wy+vz*wz;
  if(A<1e-12)return pointSegmentDistance(a,c,d);if(C<1e-12)return pointSegmentDistance(c,a,b);
  const den=A*C-B*B;let s=den<1e-12?0:Math.max(0,Math.min(1,(B*E-C*D)/den)),t=(B*s+E)/C;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-D/A));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-D)/A));}
  return Math.hypot(wx+s*ux-t*vx,wy+s*uy-t*vy,wz+s*uz-t*vz);
}
/** Shared by the real structure, its colliders, vegetation exclusions and sample.
 * Screening includes car corners and the inverted head, never only the rail axis. */
export function thrillSupports(detailed: boolean): ThrillSupport[] {
  const cached=cache.get(detailed); if(cached)return cached;
  const corners=[[-1.5,.3,-.95],[-1.5,.3,.95],[1.5,.3,-.95],[1.5,.3,.95],[-.6,1.5,-.95],[-.6,1.5,.95],[1.5,1.5,-.95],[1.5,1.5,.95],[0,2.2,0],[0,.75,0]];
  const samples=Array.from({length:3600},(_,i)=>{
    const f=thrillFrame(i/3600);return corners.map(p=>new Vector3(...p).applyQuaternion(f.rotation).add(f.point));
  }).flat();
  const sight=Array.from({length:2400},(_,i)=>{
    const f=thrillFrame(i/2400),pose=thrillRidePose(i/2400),a=new Vector3(...pose.cameraPosition);
    return [{a,b:f.point.clone().addScaledVector(f.up,2.2)},{a,b:new Vector3(...pose.cameraTarget)}];
  }).flat();
  const bodyIndex=new PointClearanceIndex(samples);
  const clear=(a:Vector3,b:Vector3,radius:number)=>!bodyIndex.blocksSegment(a,b,radius+.42)
    &&!sight.some(s=>segmentsDistance(a,b,s.a,s.b)<radius+.2);
  const groups:ThrillSupport[]=[],n=Math.ceil(THRILL_LENGTH/(detailed?18:30));
  for(let i=0;i<n;i++) {
    const f=thrillFrame(i/n);if(f.point.y<7||Math.abs(f.up.y)<.7)continue;
    const top=f.point.clone().addScaledVector(f.up,-.7),side=new Vector3(f.side.x,0,f.side.z).normalize();
    const a=top.clone().addScaledVector(side,-5.5),b=top.clone().addScaledVector(side,5.5);
    const footA=new Vector3(a.x,coasterSupportBase(a.x,a.z),a.z),footB=new Vector3(b.x,coasterSupportBase(b.x,b.z),b.z);
    const sample=inCoasterStructureSample(i/n),radius=sample?.65:top.y>35?.42:.3;
    const beams:ThrillBeam[]=[{a:footA,b:a,radius},{a:footB,b:b,radius},{a,b,radius:sample?.42:.3}];
    if(beams.some(s=>!clear(s.a,s.b,s.radius)))continue;
    // Braced bays shorten the visual unsupported length. Omit only a brace that
    // actually conflicts with a crossing train, retaining the screened main frame.
    if(detailed&&top.y>15)for(let y=2;y<top.y-4;y+=10){
      const high=Math.min(top.y-1,y+10),left=new Vector3(a.x,y,a.z),right=new Vector3(b.x,high,b.z);
      if(clear(left,right,.14))beams.push({a:left,b:right,radius:.14});
      const otherA=new Vector3(b.x,y,b.z),otherB=new Vector3(a.x,high,a.z);
      if(clear(otherA,otherB,.14))beams.push({a:otherA,b:otherB,radius:.14});
    }
    groups.push({a,b,top,beams,u:i/n});
  }
  cache.set(detailed,groups);return groups;
}
