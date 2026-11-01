import test from 'node:test';
import assert from 'node:assert/strict';
import {mineEntranceApron,mineFoundationSurface} from './alpha-mine-foundation.ts';
import {ALPHA_MINE_ORIGIN as origin,ALPHA_MINE_BASE_Y,ALPHA_MINE_FLOOR_Y,ALPHA_MINE_FOOTPRINT_POINTS} from './alpha-mine-layout.ts';
import {terrainHeight} from './WorldLandform.ts';
import {RAPIER,walkQuarry} from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';

function entranceWorld(addApron=true){return world=>{
  const vertices=[],indices=[],size=25;
  // A small patch of the production terrain height function, not a fabricated higher floor.
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=-6+i*.5,z=-4+j*.5;vertices.push(x,terrainHeight(x+origin[0],z+origin[2])-origin[1],z);
  }
  for(let j=0;j<size-1;j++)for(let i=0;i<size-1;i++){
    const a=j*size+i,b=a+1,d=a+size,c=d+1;indices.push(a,d,b,b,d,c);
  }
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());body.userData={kind:'surface'};
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)),body);
  if(addApron){const a=mineFoundationSurface(terrainHeight);world.createCollider(RAPIER.ColliderDesc.trimesh(a.vertices.map((v,i)=>v-origin[i%3]),a.indices),body);}
};}

test('entrance profile reproduces the measured 14 cm island-to-mine difference',()=>{
  assert.ok(Math.abs(ALPHA_MINE_FLOOR_Y-ALPHA_MINE_BASE_Y-.14)<1e-8);
  for(const z of [-51.6,-52.4,-53.2,-54,-55,-56.8])assert.equal(terrainHeight(-84.51,z),1);
});
test('apron triangles face upward and feather into the island within the existing climb limit',()=>{
  const {vertices:v,indices}=mineEntranceApron();
  assert.equal(v.length/3,12);assert.equal(indices.length/3,12);
  for(let k=0;k<indices.length;k+=3){
    const points=Array.from(indices.subarray(k,k+3),i=>Array.from(v.subarray(i*3,i*3+3)));
    const [a,b,c]=points,u=b.map((n,i)=>n-a[i]),w=c.map((n,i)=>n-a[i]);
    const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    assert.ok(n[1]/Math.hypot(...n)>Math.cos(25*Math.PI/180));
  }
  assert.ok(Math.abs(v[1]-ALPHA_MINE_BASE_Y)<1e-6);
  assert.ok(Math.abs(v[(4+1)*3+1]-(ALPHA_MINE_FLOOR_Y-.002))<1e-6);
});
test('continuous floor has an upward plateau and a walkable skirt tied to actual terrain',()=>{
  const {vertices:v,indices}=mineFoundationSurface(terrainHeight),n=ALPHA_MINE_FOOTPRINT_POINTS.length;
  assert.equal(v.length/3,n*2);assert.equal(indices.length/3,n-2+n*2);
  for(let i=0;i<n;i++)assert.ok(Math.abs(v[i*3+1]-(ALPHA_MINE_FLOOR_Y-.002))<1e-6);
  for(let i=n;i<n*2;i++)assert.ok(Math.abs(v[i*3+1]-terrainHeight(v[i*3],v[i*3+2]))<1e-5);
  for(let k=0;k<indices.length;k+=3){
    const [a,b,c]=Array.from(indices.subarray(k,k+3),i=>Array.from(v.subarray(i*3,i*3+3)));
    const u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
    const normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    assert.ok(normal[1]/Math.hypot(...normal)>Math.cos(25*Math.PI/180),'all floor/skirt triangles must remain walkable');
  }
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const ring of [0,1]){
    const p=Array.from({length:n},(_,i)=>[v[(i+ring*n)*3],v[(i+ring*n)*3+2]]);
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
      if(i===0&&j===n-1)continue;
      const a=p[i],b=p[(i+1)%n],c=p[j],d=p[(j+1)%n];
      assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8),'foundation contours must not self-intersect');
    }
  }
});

const paths={
  'reported blocked approach':[[-.51,-.14,1.8],[-.51,0,-1.8]],
  'outside to inside':[[-.51,-.14,4.7],[-.51,0,-1.8]],
  'beyond graded outline to inside':[[-.51,-.14,6.5],[-.51,0,-1.8]],
  'inside to outside':[[-.51,0,-1.8],[-.51,-.14,4.7]],
  'diagonal island trail':[[4.8,-.14,3.6],[0,0,0]],
  'left lane':[[-2.5,-.14,4.7],[-2.5,0,-1.8]],
  'right lane':[[2.5,-.14,4.7],[2.5,0,-1.8]],
  'feathered side entry':[[-4.7,-.14,2.1],[0,0,2.1],[0,0,-1.8]],
};
for(const [name,points] of Object.entries(paths))test(`ordinary walking across quarry foundation: ${name}`,t=>{
  const result=walkQuarry(points,{configureWorld:entranceWorld()});
  t.diagnostic(JSON.stringify(result));assert.equal(result.passed,true,JSON.stringify(result));
});
