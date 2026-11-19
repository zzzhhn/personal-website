import type { V3 } from './WorldStreetGeometry';

// Cross-section of the shipped mattress, from djc-daybed-craft/build.py.
const profile = [
  [0,.025],[1.415,.025],[1.447,.034],[1.458,.052],[1.46,.083],[1.452,.124],
  [1.452,.163],[1.46,.205],[1.455,.232],[1.442,.249],[1.425,.255],[0,.255],
] as const;
export const CLUB_DAYBED_FLAT_RADIUS = profile[profile.length-2][0];
export const CLUB_DAYBED_MATTRESS_SIDES = 192;

export function clubDaybedMattressTriangles(x:number,z:number,originY:number) {
  const top: number[] = [], sides: number[] = [];
  const point = (row:number, i:number): V3 => {
    const [radius,height] = profile[row], theta = i*Math.PI*2/CLUB_DAYBED_MATTRESS_SIDES;
    return [x+radius*Math.cos(theta),originY+height,z+radius*Math.sin(theta)];
  };
  for(let row=0;row<profile.length-1;row++) for(let i=0;i<CLUB_DAYBED_MATTRESS_SIDES;i++) {
    const a=point(row,i),b=point(row,i+1),c=point(row+1,i+1),d=point(row+1,i);
    if(row===0) sides.push(...a,...d,...c);
    else if(row===profile.length-2) top.push(...a,...d,...b);
    else sides.push(...a,...d,...c,...a,...c,...b);
  }
  return {top,sides};
}
