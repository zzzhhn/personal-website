import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { extractMineFloorCoverage, mineFoundationVisibleSurface } from './mine-floor-coverage.ts';
import { mineFoundationSurface } from './alpha-mine-foundation.ts';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';
import { readMineStaticVisual } from '../../../tools/world/alpha-mine-tests/static-visual.mjs';

const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=points=>Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function areaOf(mesh,flatOnly=false){
  let total=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const p=Array.from(mesh.indices.subarray(i,i+3),id=>Array.from(mesh.vertices.subarray(id*3,id*3+3)));
    if(flatOnly&&p.some(v=>Math.abs(v[1]-mesh.vertices[1])>1e-6))continue;
    total+=area(p.map(v=>[v[0],v[2]]));
  }
  return total;
}
function makeMesh(points,material=new MeshStandardMaterial()){
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));
  return new Mesh(g,material);
}
function intersectionArea(subject,triangle){
  let polygon=subject;
  for(let edge=0;edge<3&&polygon.length;edge++){
    const a=triangle[edge],b=triangle[(edge+1)%3],out=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=0)out.push(p);
      if((dp>=0)!==(dq>=0)){const weight=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*weight,p[1]+(q[1]-p[1])*weight]);}
    }
    polygon=out;
  }
  return polygon.length>=3?area(polygon):0;
}

test('coverage comes from actual opaque upward visual faces at the facility floor only',()=>{
  const root=new Group();root.position.set(20,8,-12);
  const floor=makeMesh([0,0,0,0,0,2,2,0,0]);floor.position.x=3;root.add(floor);
  root.add(makeMesh([0,-.13,0,0,-.13,2,2,-.13,0]));
  root.add(makeMesh([0,3,0,0,3,2,2,3,0]));
  root.add(makeMesh([0,0,0,2,0,0,0,0,2])); // underside
  root.add(makeMesh([0,0,0,0,0,2,2,0,0],new MeshStandardMaterial({transparent:true,opacity:.5})));
  const coverage=extractMineFloorCoverage(root);
  assert.equal(coverage.length,1);
  assert.deepEqual(coverage[0],[[ALPHA_MINE_ORIGIN[0]+3,ALPHA_MINE_ORIGIN[2]],
    [ALPHA_MINE_ORIGIN[0]+5,ALPHA_MINE_ORIGIN[2]],[ALPHA_MINE_ORIGIN[0]+3,ALPHA_MINE_ORIGIN[2]+2]]);
  root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});

test('clipping preserves uncovered gap fill, the exact skirt, and all collision arrays',()=>{
  const vertices=new Float32Array([0,1,0,0,1,4,4,1,4,4,1,0,0,0,-1,4,0,-1]);
  const plateauIndices=new Uint32Array([0,1,2,0,2,3]),skirtIndices=new Uint32Array([0,3,4,3,5,4]);
  const mesh={vertices,plateauIndices,skirtIndices,indices:new Uint32Array([...plateauIndices,...skirtIndices])};
  const before={vertices:vertices.slice(),indices:mesh.indices.slice()};
  const floor=[[[1,1],[3,1],[3,3]],[[1,1],[3,3],[1,3]]];
  const visible=mineFoundationVisibleSurface(mesh,floor),fallback=mineFoundationVisibleSurface(mesh,[]);
  assert.ok(Math.abs(areaOf(visible,true)-12)<1e-8,'only the covered 4 m² leaves the 16 m² cap');
  assert.ok(Math.abs(areaOf(fallback,true)-16)<1e-8,'unmounted/failed visual retains complete cap');
  assert.deepEqual(visible.vertices.slice(-skirtIndices.length*3),fallback.vertices.slice(-skirtIndices.length*3));
  assert.deepEqual(mesh.vertices,before.vertices);assert.deepEqual(mesh.indices,before.indices);
  assert.ok(Math.abs(areaOf(mineFoundationVisibleSurface(mesh,[...floor,...floor]),true)-12)<1e-8,'duplicate visual triangles cannot over-cut the gap fill');
});

test('shipped Draco floor coverage removes overlap without changing full foundation collision or skirt',async t=>{
  const asset=await readMineStaticVisual();
  try{
    const start=performance.now(),coverage=extractMineFloorCoverage(asset.root),extractMs=performance.now()-start;
    assert.ok(coverage.length>1000,'actual decoded floor faces, not an assumed rectangular footprint');
    const foundation=mineFoundationSurface(()=>1),before=foundation.indices.slice(),vertices=foundation.vertices.slice();
    const clipStart=performance.now(),visible=mineFoundationVisibleSurface(foundation,coverage),clipMs=performance.now()-clipStart;
    assert.deepEqual(foundation.indices,before);assert.deepEqual(foundation.vertices,vertices);
    const skirt=Array.from(foundation.skirtIndices).flatMap(id=>Array.from(foundation.vertices.subarray(id*3,id*3+3)));
    assert.deepEqual(Array.from(visible.vertices.slice(-skirt.length)),skirt);
    const fallback=mineFoundationVisibleSurface(foundation,[]),fullArea=areaOf(fallback,true),exposedArea=areaOf(visible,true);
    assert.ok(exposedArea>100&&exposedArea<fullArea-100,'both actual asset coverage and substantial gap fill survive');
    // Geometric intersection checks include narrow edge overlaps, not just triangle centroids.
    const cells=new Map(),key=(x,z)=>`${Math.floor(x/2)},${Math.floor(z/2)}`;
    for(const triangle of coverage){const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]);
      for(let x=Math.floor(Math.min(...xs)/2);x<=Math.floor(Math.max(...xs)/2);x++)for(let z=Math.floor(Math.min(...zs)/2);z<=Math.floor(Math.max(...zs)/2);z++){
        const k=`${x},${z}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(triangle);
      }}
    const capVertexEnd=visible.vertices.length-skirt.length;let overlaps=0,maxIntersection=0,totalIntersection=0;
    for(let i=0;i<capVertexEnd;i+=9){
      const center=[(visible.vertices[i]+visible.vertices[i+3]+visible.vertices[i+6])/3,(visible.vertices[i+2]+visible.vertices[i+5]+visible.vertices[i+8])/3];
      if((cells.get(key(...center))??[]).some(triangle=>triangle.every((a,j)=>cross(a,triangle[(j+1)%3],center)>2e-5)))overlaps++;
      const subject=[0,3,6].map(k=>[visible.vertices[i+k],visible.vertices[i+k+2]]),xs=subject.map(p=>p[0]),zs=subject.map(p=>p[1]),candidates=new Set();
      for(let x=Math.floor(Math.min(...xs)/2);x<=Math.floor(Math.max(...xs)/2);x++)for(let z=Math.floor(Math.min(...zs)/2);z<=Math.floor(Math.max(...zs)/2);z++)for(const triangle of cells.get(`${x},${z}`)??[])candidates.add(triangle);
      for(const triangle of candidates){const intersection=intersectionArea(subject,triangle);maxIntersection=Math.max(maxIntersection,intersection);totalIntersection+=intersection;}
    }
    assert.equal(overlaps,0,'exposed cap never covers the interior of a mounted floor triangle');
    assert.ok(maxIntersection<.0001&&totalIntersection<.01,JSON.stringify({maxIntersection,totalIntersection})); // float32 boundary rounding only
    t.diagnostic(JSON.stringify({actualFlatVisualTriangles:coverage.length,fullFoundationTriangles:foundation.indices.length/3,
      exposedFoundationTriangles:visible.indices.length/3,fullCapAreaM2:+fullArea.toFixed(3),exposedCapAreaM2:+exposedArea.toFixed(3),
      maxIntersectionAreaM2:maxIntersection,totalIntersectionAreaM2:totalIntersection,extractMs:+extractMs.toFixed(2),clipMs:+clipMs.toFixed(2)}));
  }finally{asset.dispose();}
});
