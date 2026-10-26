import { ALPHA_MINE_BASE_Y, ALPHA_MINE_FLOOR_Y, ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';

/** A shared draw/collision apron over the measured 14 cm island-to-quarry lip.
 * Full-height width 6 m, with 1 m feathered shoulders. It reaches the floor before the old lip.
 * The overlap is 2 mm under the mine mesh to avoid coplanar rendering. */
export function mineEntranceApron() {
  const xs=[-4,-3,3,4],zs=[4,1.9,-1],vertices:number[]=[],indices:number[]=[];
  for(let j=0;j<zs.length;j++)for(let i=0;i<xs.length;i++){
    const rise=(i===0||i===xs.length-1||j===0)?0:ALPHA_MINE_FLOOR_Y-ALPHA_MINE_BASE_Y-.002;
    vertices.push(ALPHA_MINE_ORIGIN[0]+xs[i],ALPHA_MINE_BASE_Y+rise,ALPHA_MINE_ORIGIN[2]+zs[j]);
  }
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
    const a=j*xs.length+i,b=a+1,d=a+xs.length,c=d+1;indices.push(a,b,d,b,c,d);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
