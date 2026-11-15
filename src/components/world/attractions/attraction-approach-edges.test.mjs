import test from 'node:test';
import assert from 'node:assert/strict';
import { approachEdgeSkirts } from './attraction-approach-edges.ts';
import { ATTRACTION_ROAD_SAMPLES, COASTER_ARRIVAL } from './attraction-layout.ts';
import { roadRail } from './coaster-arrival-site.ts';

const quad=(x0,z0,x1,z1,y,close=true)=>({positions:[x0,y,z0,x1,y,z0,x1,y,z1,x0,y,z1],indices:[0,2,1,0,3,2],close});
const quads=mesh=>Array.from({length:mesh.positions.length/12},(_,i)=>Array.from({length:4},(_,j)=>mesh.positions.slice(i*12+j*3,i*12+j*3+3)));
const onX=(mesh,x)=>quads(mesh).filter(ps=>ps.every(p=>Math.abs(p[0]-x)<1e-5));

test('isolated lifted top closes onto the supplied sloped terrain without mutating the top',()=>{
  const top=quad(0,0,1,1,1),before=JSON.stringify(top),[sides]=approachEdgeSkirts([top],(x,z)=>.1*x+.2*z);
  assert.equal(sides.indices.length,24);
  assert.equal(JSON.stringify(top),before);
  for(const face of quads(sides))for(const p of [face[1],face[2]])assert.ok(Math.abs(p[1]-(.1*p[0]+.2*p[2]))<1e-10);
  // Outward normals must remain visible with the existing FrontSide material.
  for(let i=0;i<sides.indices.length;i+=3){
    const p=[0,1,2].map(j=>sides.positions.slice(sides.indices[i+j]*3,sides.indices[i+j]*3+3));
    const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);
    const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const center=p[0].map((_,k)=>p.reduce((s,v)=>s+v[k],0)/3);
    assert.ok(normal[0]*(center[0]-.5)+normal[2]*(center[2]-.5)>0);
  }
});

test('same-height adjoining surfaces have no shared internal skirt',()=>{
  const sides=approachEdgeSkirts([quad(0,0,1,1,1),quad(1,0,2,1,1)],()=>0);
  assert.equal(sides.reduce((n,s)=>n+s.indices.length,0),36);
  assert.ok(sides.every(s=>onX(s,1).length===0));
});

test('partial branch opening splits a long edge and omits only the shared interval',()=>{
  const sides=approachEdgeSkirts([quad(0,0,1,1,1),quad(1,.25,2,.75,1)],()=>0);
  assert.equal(onX(sides[0],1).length,2);
  assert.equal(onX(sides[1],1).length,0);
  for(const face of onX(sides[0],1))assert.ok(face.every(p=>p[2]<=.25001)||face.every(p=>p[2]>=.74999));
});

test('overlapping lower shoulder receives one step from asphalt and no buried duplicate',()=>{
  const [asphalt,shoulder]=approachEdgeSkirts([quad(0,0,1,1,.045),quad(.95,0,2,1,.022)],()=>0);
  const step=onX(asphalt,1);
  assert.equal(step.length,1);
  assert.ok(step[0].filter((_,i)=>i===1||i===2).every(p=>Math.abs(p[1]-.022)<1e-8));
  assert.equal(onX(shoulder,.95).length,0);
});

test('connector participates in junction coverage without receiving new side geometry',()=>{
  const [road,walk]=approachEdgeSkirts([quad(0,0,1,1,1),quad(1,0,2,1,1,false)],()=>0);
  assert.equal(onX(road,1).length,0);
  assert.equal(walk.indices.length,0);
});

test('real sampled arrival junction stays open, including its partial main-road segments',()=>{
  const path=ATTRACTION_ROAD_SAMPLES[0],left=roadRail(path,-3.2),right=roadRail(path,3.2);
  const main={positions:[],indices:[]};
  path.forEach((_,i)=>{
    for(const p of [left[i],right[i]])main.positions.push(p[0],1.045,p[1]);
    if(i){const k=i*2;main.indices.push(k-2,k-1,k,k-1,k+1,k);}
  });
  const tops=[main,COASTER_ARRIVAL.road,{...COASTER_ARRIVAL.walk,close:false}];
  const before=JSON.stringify(tops),started=performance.now(),sides=approachEdgeSkirts(tops,()=>1);
  const insideMain=(x,z)=>{
    for(let i=0;i<main.indices.length;i+=3){
      const [a,b,c]=[0,1,2].map(j=>main.positions.slice(main.indices[i+j]*3,main.indices[i+j]*3+3));
      const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],ab=[b[0]-a[0],b[2]-a[2]],ac=[c[0]-a[0],c[2]-a[2]],ap=[x-a[0],z-a[2]],den=cross(ab,ac);
      const u=cross(ap,ac)/den,v=cross(ab,ap)/den;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return true;
    }
    return false;
  };
  assert.ok(sides[1].indices.length>0,'turning-head exterior still needs closure');
  for(const face of quads(sides[1])){
    const x=(face[0][0]+face[3][0])/2,z=(face[0][2]+face[3][2])/2;
    assert.equal(insideMain(x,z),false,`branch added a wall inside retained road at ${x},${z}`);
  }
  assert.equal(JSON.stringify(tops),before,'survey and frozen contacts must remain unchanged');
  console.log(JSON.stringify({arrivalSideTriangles:sides.map(s=>s.indices.length/3),elapsedMs:Math.round(performance.now()-started)}));
});
