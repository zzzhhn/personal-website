import { Matrix4, Quaternion, Vector3 } from 'three';
import { THRILL_ELEMENTS, THRILL_CREST, THRILL_DROP_END, THRILL_LENGTH, thrillCurve, type ThrillElement } from './coaster-thrill-layout.ts';
import type { AttractionRidePose } from './attraction-ride.ts';
import type { Vec3 } from '../types';

const UP=new Vector3(0,1,0),N=7200,TAU=Math.PI*2;
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(t*(t*6-15)+10);};
const wrap=(u:number)=>((u%1)+1)%1;
const angle=(a:Vector3,b:Vector3,axis:Vector3)=>Math.atan2(new Vector3().crossVectors(a,b).dot(axis),a.dot(b));
const near=(a:number,b:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a));
const transported:{forward:Vector3;up:Vector3}[]=[];
for(let i=0;i<=N;i++) {
  const forward=thrillCurve.getTangentAt(i/N).normalize();
  const up=i?transported[i-1].up.clone().applyQuaternion(new Quaternion().setFromUnitVectors(transported[i-1].forward,forward))
    :UP.clone().addScaledVector(forward,-forward.y).normalize();
  up.addScaledVector(forward,-up.dot(forward)).normalize();transported.push({forward,up});
}
function gravityAngle(u:number,inverted=false) {
  const f=transported[Math.round(u*N)],up=UP.clone().addScaledVector(f.forward,-f.forward.y).normalize();
  if(inverted)up.negate();
  return angle(f.up,up,f.forward);
}
// An over-vertical drop crosses the same gravity-frame singularity as a loop.
// Preserve its transported frame too, without counting it as a full inversion.
const frameSpans:ThrillElement[]=[{id:'drop',label:'内扣首降',kind:'loop',start:THRILL_CREST,end:THRILL_DROP_END,peaks:[],turns:0},...THRILL_ELEMENTS];
const anchors=new Map<ThrillElement,{u:number;roll:number}[]>();
for(const e of frameSpans) {
  const values=[{u:e.start,roll:gravityAngle(e.start)}];
  if(e.kind==='cobra')for(const p of e.peaks)values.push({u:p,roll:near(values[values.length-1].roll,gravityAngle(p,true))});
  values.push({u:e.end,roll:near(values[values.length-1].roll,gravityAngle(e.end))});
  anchors.set(e,values);
}
const rotations=transported.map((f,i)=>{
  const u=i/N,e=frameSpans.find(e=>u>=e.start&&u<=e.end);
  let roll=gravityAngle(u);
  if(e) {
    const t=(u-e.start)/(e.end-e.start);
    if(e.kind==='loop'||e.kind==='cobra') {
      const a=anchors.get(e)!;let j=0;
      while(j<a.length-2&&u>a[j+1].u)j++;
      roll=a[j].roll+(a[j+1].roll-a[j].roll)*smooth((u-a[j].u)/(a[j+1].u-a[j].u));
    } else if(e.kind==='stall') {
      // Enter a half roll, hold upside down over the high straight, then complete it.
      roll+=Math.PI*(smooth(t/.28)+smooth((t-.72)/.28));
    } else {
      const cycle=t*e.turns,whole=Math.floor(cycle);
      roll+=TAU*(whole+smooth(cycle-whole));
    }
  }
  const up=f.up.clone().applyAxisAngle(f.forward,roll),side=new Vector3().crossVectors(f.forward,up).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(f.forward,up,side));
});
rotations[N].copy(rotations[0]);

/** One orientation field drives both rails and seats. Vertical tangents never use a
 * world-up cross product, while authored twists rotate the actual train frame. */
export function thrillFrame(u:number) {
  const d=wrap(u),at=d*N,lo=Math.floor(at),rotation=rotations[lo].clone().slerp(rotations[lo+1],at-lo);
  const forward=new Vector3(1,0,0).applyQuaternion(rotation),up=UP.clone().applyQuaternion(rotation);
  return {point:thrillCurve.getPointAt(d),rotation,forward,up,side:new Vector3(0,0,1).applyQuaternion(rotation)};
}
export function thrillSeat(u:number) {
  const f=thrillFrame(u);
  return {position:f.point.clone().addScaledVector(f.up,.72),eye:f.point.clone().addScaledVector(f.up,1.74),rotation:f.rotation};
}
export function thrillRidePose(u:number,firstPerson=false):AttractionRidePose {
  const f=thrillFrame(u),seat={position:f.point.clone().addScaledVector(f.up,.72),eye:f.point.clone().addScaledVector(f.up,1.74),rotation:f.rotation},d=wrap(u)*THRILL_LENGTH;
  let camera=seat.eye.clone(),target=camera.clone().addScaledVector(f.forward,8);
  if(!firstPerson) {
    camera=f.point.clone().addScaledVector(f.forward,-8).addScaledVector(UP,4.5);
    target=seat.position.clone().addScaledVector(UP,.7);
    const inversion=frameSpans.reduce((max,e)=>Math.max(max,
      smooth((d-e.start*THRILL_LENGTH+18)/14)*(1-smooth((d-e.end*THRILL_LENGTH-8)/14))),0);
    // Above an inverted train is its rail spine. View from the side, on the seat side
    // of the track, so the default spectator camera actually shows the rider.
    camera.lerp(f.point.clone().addScaledVector(f.side,4.3).addScaledVector(f.up,4.8),inversion);
    target.lerp(seat.position.clone().addScaledVector(f.up,.7),inversion);
  }
  return {seat:seat.position.toArray() as Vec3,yaw:Math.atan2(-f.forward.z,f.forward.x),orientation:f.rotation.toArray(),
    cameraPosition:camera.toArray() as Vec3,cameraTarget:target.toArray() as Vec3,cameraUp:firstPerson?f.up.toArray() as Vec3:[0,1,0],firstPerson,fov:firstPerson?66:58};
}
export const THRILL_FRAME_SAMPLES=N;
export function thrillSectionAt(u:number) {
  return THRILL_ELEMENTS.find(e=>u>=e.start&&u<=e.end)?.label??'连接段';
}
export function thrillCurvature(u:number) {
  const ds=.4,a=thrillCurve.getTangentAt(wrap(u-ds/THRILL_LENGTH)),b=thrillCurve.getTangentAt(wrap(u+ds/THRILL_LENGTH));
  return a.distanceTo(b)/(2*ds);
}
