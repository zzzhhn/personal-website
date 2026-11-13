import { THRILL_CREST, THRILL_DROP_END, THRILL_LENGTH, thrillCurve } from './coaster-thrill-layout.ts';
import { thrillFrame, thrillCurvature } from './coaster-thrill-frame.ts';

export const THRILL_RELEASE_SECONDS=29;
const count=3600,ds=(1-THRILL_CREST)*THRILL_LENGTH/count;
const releaseY=thrillCurve.getPointAt(THRILL_CREST).y;
/** Distance-based prototype timing. Never squeeze a longer route into a fixed duration:
 * speed is limited by curvature and real seat angular velocity before braking passes. */
export const THRILL_RUN=Array.from({length:count+1},(_,i)=>{
  const u=THRILL_CREST+(1-THRILL_CREST)*i/count,s=i*ds;
  const a=thrillFrame(u-.4/THRILL_LENGTH),b=thrillFrame(u+.4/THRILL_LENGTH);
  const turn=a.rotation.angleTo(b.rotation)/.8;
  const energy=Math.sqrt(Math.max(0,2*9.81*(releaseY-thrillCurve.getPointAt(u).y)+6*Math.min(s,16)-.35*s));
  const limit=Math.min(44,Math.sqrt(34/Math.max(.0001,thrillCurvature(u))),3.2/Math.max(.0001,turn),energy);
  return {u,s,speed:limit,time:0};
});
THRILL_RUN[0].speed=0;THRILL_RUN[count].speed=0;
// Forward acceleration and backward braking limits apply across element boundaries.
for(let i=1;i<=count;i++)THRILL_RUN[i].speed=Math.min(THRILL_RUN[i].speed,Math.sqrt(THRILL_RUN[i-1].speed**2+2*7.5*ds));
for(let i=count-1;i>=0;i--)THRILL_RUN[i].speed=Math.min(THRILL_RUN[i].speed,Math.sqrt(THRILL_RUN[i+1].speed**2+2*5.5*ds));
for(let i=1;i<=count;i++)THRILL_RUN[i].time=THRILL_RUN[i-1].time+2*ds/Math.max(.001,THRILL_RUN[i].speed+THRILL_RUN[i-1].speed);
/** Keep the original spatial speed table intact as the source profile. */
export const THRILL_BASE_DURATION=THRILL_RELEASE_SECONDS+THRILL_RUN[count].time;
let brakeIndex=count;
// The terminal contiguous suffix governed by the original 5.5 m/s² stop pass.
while(brakeIndex>0&&Math.abs(THRILL_RUN[brakeIndex-1].speed**2-THRILL_RUN[brakeIndex].speed**2-2*5.5*ds)<1e-7)brakeIndex--;
const dropIndex=Math.min(count-1,Math.floor((THRILL_DROP_END-THRILL_CREST)/(1-THRILL_CREST)*count));
const dropA=THRILL_RUN[dropIndex],dropB=THRILL_RUN[dropIndex+1],dropDistance=(THRILL_DROP_END-dropA.u)*THRILL_LENGTH;
const dropAcceleration=(dropB.speed**2-dropA.speed**2)/(2*ds);
const dropTime=dropA.time+2*dropDistance/(dropA.speed+Math.sqrt(Math.max(0,dropA.speed**2+2*dropAcceleration*dropDistance)));
const factor=1.25,extra=factor-1,transitionSeconds=1;
const start=THRILL_RELEASE_SECONDS+dropTime,sourceEnd=THRILL_RELEASE_SECONDS+THRILL_RUN[brakeIndex].time;
// Each ramp lasts one actual ride second and consumes 1.125 source seconds.
// Finish the down-ramp before the original terminal braking suffix begins.
const rampSource=transitionSeconds*(1+factor)/2;
const sourcePlateauStart=start+rampSource,sourcePlateauEnd=sourceEnd-rampSource;
const plateauStart=start+transitionSeconds;
const plateauEnd=plateauStart+(sourcePlateauEnd-sourcePlateauStart)/factor,end=plateauEnd+transitionSeconds;
export const THRILL_SPEED_WINDOW={factor,start,sourceEnd,brakeStartU:THRILL_RUN[brakeIndex].u,
  transitionSeconds,plateauStart,plateauEnd,end,sourcePlateauStart,sourcePlateauEnd};
const rateEase=(q:number)=>q*q*(3-2*q),rateIntegral=(q:number)=>q*q*q*(1-q/2);
/** C1 speed multiplier: exact 1.25 plateau, unit rate before the drop end and
 * throughout the old terminal brake. No position, speed or added-acceleration jump. */
export function thrillSpeedMultiplierAt(seconds:number) {
  if(seconds<=start||seconds>=end)return 1;
  if(seconds<plateauStart)return 1+extra*rateEase((seconds-start)/transitionSeconds);
  if(seconds<=plateauEnd)return factor;
  return factor-extra*rateEase((seconds-plateauEnd)/transitionSeconds);
}
export function thrillSourceTimeAt(seconds:number) {
  if(seconds<=start)return seconds;
  if(seconds<plateauStart){const q=(seconds-start)/transitionSeconds;return start+transitionSeconds*(q+extra*rateIntegral(q));}
  if(seconds<=plateauEnd)return sourcePlateauStart+(seconds-plateauStart)*factor;
  if(seconds<end){const q=(seconds-plateauEnd)/transitionSeconds;return sourcePlateauEnd+transitionSeconds*(factor*q-extra*rateIntegral(q));}
  return sourceEnd+seconds-end;
}
export function thrillRideTimeAt(sourceSeconds:number) {
  if(sourceSeconds<=start)return sourceSeconds;
  if(sourceSeconds>=sourceEnd)return end+sourceSeconds-sourceEnd;
  if(sourceSeconds>=sourcePlateauStart&&sourceSeconds<=sourcePlateauEnd)return plateauStart+(sourceSeconds-sourcePlateauStart)/factor;
  // Only metadata/tests need the inverse on a ramp; the frame loop is closed-form.
  let low=sourceSeconds<sourcePlateauStart?start:plateauEnd,high=low+transitionSeconds;
  for(let i=0;i<44;i++){const mid=(low+high)/2;if(thrillSourceTimeAt(mid)<sourceSeconds)low=mid;else high=mid;}
  return (low+high)/2;
}
export const THRILL_DURATION=thrillRideTimeAt(THRILL_BASE_DURATION);
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export function thrillBaseDistanceAt(seconds:number) {
  const t=Math.max(0,Math.min(THRILL_BASE_DURATION,Number.isFinite(seconds)?seconds:0));
  if(t>=THRILL_BASE_DURATION)return 1;
  if(t<27)return THRILL_CREST*smooth(t/27);
  if(t<THRILL_RELEASE_SECONDS)return THRILL_CREST;
  const runTime=t-THRILL_RELEASE_SECONDS;
  let lo=0,hi=count;
  while(hi-lo>1){const mid=(lo+hi)>>>1;if(THRILL_RUN[mid].time<runTime)lo=mid;else hi=mid;}
  const a=THRILL_RUN[lo],b=THRILL_RUN[hi],dt=Math.min(b.time-a.time,Math.max(0,runTime-a.time));
  const acceleration=(b.speed-a.speed)/(b.time-a.time);
  return Math.min(1,a.u+(a.speed*dt+.5*acceleration*dt*dt)/THRILL_LENGTH);
}
export function thrillDistanceAt(seconds:number) {
  const t=Math.max(0,Math.min(THRILL_DURATION,Number.isFinite(seconds)?seconds:0));
  return t>=THRILL_DURATION?1:thrillBaseDistanceAt(thrillSourceTimeAt(t));
}
export function thrillSpeedAt(seconds:number) {
  const epsilon=.001;
  return (thrillDistanceAt(seconds+epsilon)-thrillDistanceAt(seconds-epsilon))*THRILL_LENGTH/(2*epsilon);
}
