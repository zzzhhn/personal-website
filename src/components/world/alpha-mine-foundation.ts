import { ShapeUtils, Vector2 } from 'three';
import { ALPHA_MINE_BASE_Y, ALPHA_MINE_FLOOR_Y, ALPHA_MINE_ORIGIN, ALPHA_MINE_FOOTPRINT_POINTS } from './alpha-mine-layout.ts';

/** Continuous low-storey earth, shared by drawing and physics. Existing quarry floors sit 2 mm
 * above it; rock and raised decks remain untouched. The outer skirt meets actual island heights. */
export function mineFoundationSurface(heightAt: (x:number,z:number)=>number) {
  const contour=ALPHA_MINE_FOOTPRINT_POINTS.map(([x,z])=>new Vector2(x,z));
  const vertices:number[]=[],indices:number[]=[],n=contour.length;
  const center=contour.reduce((sum,p)=>sum.add(p),new Vector2()).multiplyScalar(1/n);
  for(const p of contour)vertices.push(p.x,ALPHA_MINE_FLOOR_Y-.002,p.y);
  for(const p of contour){
    // The locked star-shaped outline keeps this skirt simple. Width is checked against the
    // terrain and 25-degree limit; a miter offset folds at the outline's tight concave corners.
    const outer=p.clone().sub(center).normalize().multiplyScalar(1.75).add(p);
    vertices.push(outer.x,heightAt(outer.x,outer.y),outer.y);
  }
  const triangle=(a:number,b:number,c:number)=>{
    const y=(vertices[b*3+2]-vertices[a*3+2])*(vertices[c*3]-vertices[a*3])
      -(vertices[b*3]-vertices[a*3])*(vertices[c*3+2]-vertices[a*3+2]);
    indices.push(a,y>=0?b:c,y>=0?c:b);
  };
  for(const t of ShapeUtils.triangulateShape(contour,[]))triangle(t[0],t[1],t[2]);
  for(let i=0;i<n;i++){const j=(i+1)%n;triangle(i,j,n+i);triangle(j,n+j,n+i);}
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}

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
