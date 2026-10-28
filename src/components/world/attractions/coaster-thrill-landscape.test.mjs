import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoasterTerrainRelief, COASTER_THRILL_RELIEF } from './coaster-terrain-relief.ts';
import { coasterFrame, coasterSupports } from './coaster-track.ts';

const relief=createCoasterTerrainRelief();
const additions=relief.formations.filter(f=>f.id.startsWith('thrill-'));
const triangles=[],bins=new Map();
for(const f of additions)for(let i=f.firstTriangle;i<f.firstTriangle+f.terrainTriangleCount;i++){
  const points=Array.from(relief.indices.subarray(i*3,i*3+3),v=>Array.from(relief.vertices.subarray(v*3,v*3+3)));
  const id=triangles.length;triangles.push(points);
  for(let x=Math.floor(Math.min(...points.map(p=>p[0]))/5);x<=Math.floor(Math.max(...points.map(p=>p[0]))/5);x++)
    for(let z=Math.floor(Math.min(...points.map(p=>p[2]))/5);z<=Math.floor(Math.max(...points.map(p=>p[2]))/5);z++){
      const key=`${x},${z}`,bucket=bins.get(key)??[];bucket.push(id);bins.set(key,bucket);
    }
}
function heightAt(x,z){
  let height=-Infinity;
  for(const id of bins.get(`${Math.floor(x/5)},${Math.floor(z/5)}`)??[]){
    const [a,b,c]=triangles[id],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(d)<1e-7)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d;
    const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)height=Math.max(height,u*a[1]+v*b[1]+(1-u-v)*c[1]);
  }
  return height;
}
test.after(()=>relief.geometry.dispose());

test('three broad relief additions retain the same render/collision batch and a bounded mesh',()=>{
  assert.equal(additions.length,3);assert.equal(COASTER_THRILL_RELIEF.length,3);
  const addedTriangles=additions.reduce((sum,f)=>sum+f.triangleCount,0);
  assert.ok(addedTriangles<14000,`new relief has ${addedTriangles} triangles`);
  const positions=relief.geometry.getAttribute('position');
  for(const f of additions)for(let i=f.firstTriangle*3;i<(f.firstTriangle+f.triangleCount)*3;i++){
    const v=relief.indices[i]*3;
    assert.deepEqual([positions.getX(i),positions.getY(i),positions.getZ(i)],Array.from(relief.vertices.subarray(v,v+3)));
  }
  let raised=0,covered=0,maxHeight=0;
  for(let x=-60;x<170;x+=5)for(let z=-205;z<-43;z+=5){
    const height=heightAt(x+50,z-195)-1;
    if(!Number.isFinite(height))continue;
    covered++;if(height>2)raised++;maxHeight=Math.max(maxHeight,height);
  }
  assert.ok(covered*25>9000);assert.ok(raised*25>1500);assert.ok(maxHeight>9);
  console.log(JSON.stringify({addedTriangles,totalTriangles:relief.triangleCount,shrubs:relief.shrubCount,
    sampledCoverage:covered*25,raisedAbove2m:raised*25,maximumHeight:maxHeight}));
});

test('tower four-leg apron and both support LOD foundations stay at retained ground',()=>{
  const feet=[...[-52,-36].flatMap(x=>[-156,-144].map(z=>[x+50,z-195])),
    ...[true,false].flatMap(detailed=>coasterSupports(detailed).flatMap(({a,b})=>[a,b].map(p=>[p.x,p.z])))];
  for(const [x,z] of feet)for(const [dx,dz] of [[0,0],[-1.4,0],[1.4,0],[0,-1.4],[0,1.4]])
    assert.ok(heightAt(x+dx,z+dz)<=1.05,`buried foundation at ${x},${z}`);
});

test('bounded body samples stay above the new terrain and the water-roll inlet remains open',()=>{
  let minimum=Infinity;
  for(let sample=0;sample<600;sample++){
    const f=coasterFrame(sample/600);
    for(const lift of [-.45,.8,2.2]){
      const p=f.point.clone().addScaledVector(f.up,lift),height=heightAt(p.x,p.z);
      if(Number.isFinite(height))minimum=Math.min(minimum,p.y-height);
    }
  }
  assert.ok(minimum>1.7,`vertical body clearance ${minimum}`);
  for(let x=122;x<160;x+=4)for(let z=-32;z<12;z+=4)
    assert.equal(heightAt(x+50,z-195),-Infinity,`filled water-roll inlet at ${x},${z}`);
  console.log(JSON.stringify({boundedBodySamples:1800,minimumVerticalClearance:minimum}));
});
