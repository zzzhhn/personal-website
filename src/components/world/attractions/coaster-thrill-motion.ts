import { THRILL_CREST, THRILL_LENGTH, thrillCurve } from './coaster-thrill-layout.ts';
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
export const THRILL_DURATION=THRILL_RELEASE_SECONDS+THRILL_RUN[count].time;
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export function thrillDistanceAt(seconds:number) {
  const t=Math.max(0,Math.min(THRILL_DURATION,Number.isFinite(seconds)?seconds:0));
  if(t>=THRILL_DURATION)return 1;
  if(t<27)return THRILL_CREST*smooth(t/27);
  if(t<THRILL_RELEASE_SECONDS)return THRILL_CREST;
  const runTime=t-THRILL_RELEASE_SECONDS;
  let lo=0,hi=count;
  while(hi-lo>1){const mid=(lo+hi)>>>1;if(THRILL_RUN[mid].time<runTime)lo=mid;else hi=mid;}
  const a=THRILL_RUN[lo],b=THRILL_RUN[hi],dt=Math.min(b.time-a.time,Math.max(0,runTime-a.time));
  const acceleration=(b.speed-a.speed)/(b.time-a.time);
  return Math.min(1,a.u+(a.speed*dt+.5*acceleration*dt*dt)/THRILL_LENGTH);
}
export function thrillSpeedAt(seconds:number) {
  const epsilon=.001;
  return (thrillDistanceAt(seconds+epsilon)-thrillDistanceAt(seconds-epsilon))*THRILL_LENGTH/(2*epsilon);
}
