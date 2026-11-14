import { useLayoutEffect, useMemo } from 'react';
import { Matrix4, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import { create } from 'zustand';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout';
import { useGreyboxClaim } from './WorldVisualClaims';

type Point = [number, number];
export type MineFloorTriangle = [Point, Point, Point];
export interface MineFoundationMesh { vertices: Float32Array; indices: Uint32Array; plateauIndices: Uint32Array; skirtIndices: Uint32Array }
const EMPTY: readonly MineFloorTriangle[] = [];
const cross = (a: Point, b: Point, p: Point) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area = (p: Point[]) => p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;

/** Read the mounted visual, never the collider proxy. Draco's 20-bit position quantization
 * introduces sub-millimetre error; only nearly level, upward opaque faces at local y=0 own the cap.
 * Recessed authored dirt (-13 cm), walls, undersides and raised decks do not claim it. */
export function extractMineFloorCoverage(root: Object3D): MineFloorTriangle[] {
  root.updateWorldMatrix(true,true);
  const inverse=new Matrix4().copy(root.matrixWorld).invert(),matrix=new Matrix4(),a=new Vector3(),b=new Vector3(),c=new Vector3();
  const triangles:MineFloorTriangle[]=[];
  root.traverse(object=>{
    if(!(object instanceof Mesh)||!object.visible)return;
    const g:BufferGeometry=object.geometry,p=g.getAttribute('position'),index=g.index;
    if(!p)return;
    matrix.multiplyMatrices(inverse,object.matrixWorld);
    const count=index?.count??p.count,start=g.drawRange.start,end=Math.min(count,start+g.drawRange.count);
    for(let i=start;i+2<end;i+=3){
      const group=g.groups.find(group=>i>=group.start&&i<group.start+group.count);
      const material=Array.isArray(object.material)?object.material[group?.materialIndex??0]:object.material;
      if(!material||!material.visible||material.transparent||material.opacity<1)continue;
      a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix);
      b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(matrix);
      c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(matrix);
      if(![a.y,b.y,c.y].every(y=>Math.abs(y)<.0005))continue;
      const triangle:MineFloorTriangle=[[a.x+ALPHA_MINE_ORIGIN[0],a.z+ALPHA_MINE_ORIGIN[2]],
        [b.x+ALPHA_MINE_ORIGIN[0],b.z+ALPHA_MINE_ORIGIN[2]],[c.x+ALPHA_MINE_ORIGIN[0],c.z+ALPHA_MINE_ORIGIN[2]]];
      if(cross(...triangle)>=-1e-9)continue; // +Y winding is clockwise in XZ.
      triangles.push([triangle[0],triangle[2],triangle[1]]); // CCW for clipping.
    }
  });
  return triangles;
}

const useCoverageStore=create<{entries:Map<object,readonly MineFloorTriangle[]>;triangles:readonly MineFloorTriangle[]}>(()=>({entries:new Map(),triangles:EMPTY}));
export const useMineFloorCoverage=()=>useCoverageStore(s=>s.triangles);
/** Publish copied coordinates only after the decoded visual actually mounts. The shared
 * layout-effect claim keeps full fallback coverage during loading/failure and restores it on unmount. */
export function useMountedMineFloorCoverage(root:Object3D) {
  const triangles=useMemo(()=>extractMineFloorCoverage(root),[root]);
  useLayoutEffect(()=>{
    const token={};
    const update=(add:boolean)=>useCoverageStore.setState(state=>{
      const entries=new Map(state.entries);if(add)entries.set(token,triangles);else entries.delete(token);
      return {entries,triangles:entries.size?[...entries.values()].flat():EMPTY};
    });
    update(true);return()=>{update(false);};
  },[triangles]);
  useGreyboxClaim('alpha-mine-floor');
}

function clip(polygon:Point[],a:Point,b:Point,inside:boolean):Point[] {
  const out:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=inside?dp>=0:dp<=0,iq=inside?dq>=0:dq<=0;
    if(ip)out.push(p);
    if(ip!==iq){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  return out;
}
function subtract(polygon:Point[],triangle:MineFloorTriangle):Point[][] {
  let remaining=polygon;const out:Point[][]=[];
  for(let i=0;i<3&&remaining.length>=3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],outside=clip(remaining,a,b,false);
    if(outside.length>=3&&Math.abs(area(outside))>1e-9)out.push(outside);
    remaining=clip(remaining,a,b,true);
  }
  return out;
}

/** Subtract actual flat visual triangles in bounded 2 m cells. The original collider arrays and
 * skirt faces remain untouched; the extra tessellation belongs only to the exposed fallback cap. */
export function mineFoundationVisibleSurface(mesh:MineFoundationMesh,coverage:readonly MineFloorTriangle[]) {
  const positions:number[]=[],indices:number[]=[],cell=2;
  const emit=(points:number[])=>{const offset=positions.length/3;positions.push(...points);for(let i=0;i<points.length/3;i++)indices.push(offset+i);};
  const point=(index:number)=>Array.from(mesh.vertices.subarray(index*3,index*3+3));
  if(!coverage.length){for(const i of mesh.indices)emit(point(i));return {vertices:new Float32Array(positions),indices:new Uint32Array(indices)};}
  const cells=new Map<string,MineFloorTriangle[]>();
  for(const triangle of coverage){
    const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++){
      const key=`${x},${z}`,list=cells.get(key)??[];list.push(triangle);cells.set(key,list);
    }
  }
  for(let i=0;i<mesh.plateauIndices.length;i+=3){
    const vertices=Array.from(mesh.plateauIndices.subarray(i,i+3),point),y=vertices[0][1];
    const source=vertices.map(p=>[p[0],p[2]] as Point);if(area(source)<0)source.reverse();
    const xs=source.map(p=>p[0]),zs=source.map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++){
      const x0=x*cell,z0=z*cell,rectangle:Point[]=[[x0,z0],[x0+cell,z0],[x0+cell,z0+cell],[x0,z0+cell]];
      let polygon=source;for(let edge=0;edge<4&&polygon.length>=3;edge++)polygon=clip(polygon,rectangle[edge],rectangle[(edge+1)%4],true);
      if(polygon.length<3||Math.abs(area(polygon))<1e-9)continue;
      let fragments=[polygon];
      for(const triangle of cells.get(`${x},${z}`)??[]){fragments=fragments.flatMap(fragment=>subtract(fragment,triangle));if(!fragments.length)break;}
      for(const fragment of fragments)for(let k=1;k<fragment.length-1;k++){
        if(Math.abs(cross(fragment[0],fragment[k],fragment[k+1]))<1e-9)continue;
        emit([fragment[0][0],y,fragment[0][1],fragment[k+1][0],y,fragment[k+1][1],fragment[k][0],y,fragment[k][1]]);
      }
    }
  }
  for(const i of mesh.skirtIndices)emit(point(i));
  return {vertices:new Float32Array(positions),indices:new Uint32Array(indices)};
}
