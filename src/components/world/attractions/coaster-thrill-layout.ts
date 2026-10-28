import { CatmullRomCurve3, Vector3 } from 'three';
import type { Vec3 } from '../types';

/** Ride-space prototype for the user's high-drop/multiple-inversion correction.
 * Deliberately not selected by the live island until structure, camera and night review.
 * Local origin matches the current station, so boarding does not move with the expansion. */
export type ThrillKind = 'loop' | 'cobra' | 'stall' | 'roll';
export interface ThrillElement {
  id: string; label: string; kind: ThrillKind; start: number; end: number;
  peaks: number[]; turns: number;
}
export const THRILL_POINTS: Vec3[] = [];
const point = (p: Vec3) => THRILL_POINTS.push(p) - 1;
const points = (ps: Vec3[]) => ps.forEach(point);
const marks: { id: string; label: string; kind: ThrillKind; start: number; end: number; peaks: number[]; turns: number }[] = [];
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

points([[0,.8,43],[0,1.2,30],[-17,9,20],[-33,25,-20],[-33,58,-90],[-33,80,-132],[-32,84,-145],[-25,84,-151]]);
export const THRILL_CREST_INDEX = THRILL_POINTS.length - 1;
// X reverses while descending: the drop actually goes beyond vertical in its own plane.
points([[-14,81,-151],[-11,70,-151],[-14,54,-151],[-18,38,-151],[-16,22,-151],[-6,8,-151],[15,4,-151]]);
export const THRILL_DROP_END_INDEX = THRILL_POINTS.length - 1;

function loop(id: string, label: string, origin: Vec3, rx: number, ry: number, direction: number, tilt = 0) {
  const start = THRILL_POINTS.length;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI * 2, rise = ry * (1 - Math.cos(a));
    point([origin[0] + direction * (rx * (Math.sin(a) + .12*Math.sin(2*a)) + 6 * smooth(t)),
      origin[1] + rise * Math.cos(tilt), origin[2] - rise * Math.sin(tilt) + 12 * smooth(t)]);
  }
  marks.push({id,label,kind:'loop',start,end:THRILL_POINTS.length-1,peaks:[start+12],turns:0});
}
loop('giant-loop','巨型立环',[25,4,-151],30,25,1);
points([[50,6,-129],[78,12,-130],[106,13,-143]]);

// Cobra roll: half-loop up, half twist out, mirror half twist, half-loop down.
// The high connector reverses the direction; these are not two duplicated full circles.
let start = point([119,12,-150]);
points([[133,20,-150],[140,34,-150],[133,47,-150],[118,48,-155],[113,40,-166]]);
marks.push({id:'cobra-in',label:'眼镜蛇上翻',kind:'cobra',start,end:THRILL_POINTS.length-1,peaks:[start+3],turns:0});
start = point([118,38,-178]);
points([[139,41,-186],[156,48,-180],[165,39,-168],[160,24,-158],[147,12,-158],[130,10,-163]]);
marks.push({id:'cobra-out',label:'眼镜蛇下翻',kind:'cobra',start,end:THRILL_POINTS.length-1,peaks:[start+2],turns:0});

start = point([114,17,-177]);
points([[100,31,-192],[81,34,-198],[72,34,-174],[88,30,-149],[118,15,-132]]);
marks.push({id:'stall',label:'高空持续倒挂',kind:'stall',start,end:THRILL_POINTS.length-1,peaks:[start+2,start+3],turns:1});
points([[136,11,-120],[128,10,-108]]);
loop('tilted-loop','倾斜立环',[105,10,-108],24,20,-1,.28);
points([[78,10,-94],[54,13,-110],[19,16,-119],[-10,18,-119],[-30,22,-110],[-36,25,-92],[-22,24,-80],[0,19,-69],[20,16,-74]]);

start = THRILL_POINTS.length;
for (let i=0;i<=32;i++) {
  const t=i/32,a=t*Math.PI*4;
  point([35+80*t,16+5*(1-Math.cos(a)),-63+6*Math.sin(a)]);
}
marks.push({id:'double-corkscrew',label:'连续双螺旋',kind:'roll',start,end:THRILL_POINTS.length-1,peaks:[start+8,start+24],turns:2});
points([[135,12,-50],[152,9,-27],[146,8,-7],[125,7,4]]);
start=THRILL_POINTS.length;
for(let i=0;i<=16;i++) {
  const t=i/16;
  point([110-60*t,8+3*Math.sin(Math.PI*t),8+2*Math.sin(2*Math.PI*t)]);
}
marks.push({id:'water-roll',label:'贴水桶滚',kind:'roll',start,end:THRILL_POINTS.length-1,peaks:[start+8],turns:1});
points([[34,7,14],[18,6,23],[0,5,14],[-20,4,6]]);
export const THRILL_TUNNEL_START_INDEX=THRILL_POINTS.length;
// Keep the established final station approach, platform and train parking pose.
points([[-34,2.8,1],[-47,2.4,13],[-40,2.2,34],[-22,1.8,38],[-16,1,43],[-9,.8,51],[-2,.8,49]]);

export const thrillCurve=new CatmullRomCurve3(THRILL_POINTS.map(p=>new Vector3(p[0]+50,p[1]+1,p[2]-195)),true,'centripetal');
thrillCurve.arcLengthDivisions=16384;
const lengths=thrillCurve.getLengths();
export const THRILL_LENGTH=lengths[lengths.length-1];
export function thrillControlU(index:number) {
  const at=index/THRILL_POINTS.length*(lengths.length-1),lo=Math.floor(at),hi=Math.min(lo+1,lengths.length-1);
  return (lengths[lo]+(lengths[hi]-lengths[lo])*(at-lo))/THRILL_LENGTH;
}
export const THRILL_ELEMENTS:ThrillElement[]=marks.map(e=>({...e,start:thrillControlU(e.start),end:thrillControlU(e.end),peaks:e.peaks.map(thrillControlU)}));
export const THRILL_CREST=thrillControlU(THRILL_CREST_INDEX);
export const THRILL_DROP_END=thrillControlU(THRILL_DROP_END_INDEX);
