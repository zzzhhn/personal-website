import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { landscapeRocks, landscapeRockCollider, landscapeRockSurfaceParts, LANDSCAPE_ROCK_SITES } from './coaster-landscape-rocks.ts';
import { addCoasterLandscape } from './coaster-landscape.ts';
import { CoasterBatch } from './coaster-geometry.ts';
import { coasterFrame, coasterWorld } from './coaster-track.ts';
import { COASTER_CLIFF_WALK } from './coaster-landscape-cliffs.ts';
import { COASTER_INFIELD_WALK } from './coaster-terrain-relief.ts';

const {rocks,islands}=landscapeRocks();
const vertices=r=>Array.from({length:r.hull.length/3},(_,i)=>new Vector3(...r.hull.slice(i*3,i*3+3)));
function shape(r) {
  const vs=vertices(r),planes=[];
  for(let i=0;i<vs.length;i+=3)planes.push({p:vs[i],n:vs[i+1].clone().sub(vs[i]).cross(vs[i+2].clone().sub(vs[i])).normalize()});
  return {vs,planes};
}
const inside=(v,planes,margin=0)=>planes.every(p=>p.n.dot(v.clone().sub(p.p))<=margin);
const bounds=r=>new Box3(new Vector3(...coasterWorld(r.position)).sub(new Vector3(...r.half)),new Vector3(...coasterWorld(r.position)).add(new Vector3(...r.half)));
function area(vs) {let a=0;for(let i=0;i<vs.length;i+=3)a+=vs[i+1].clone().sub(vs[i]).cross(vs[i+2].clone().sub(vs[i])).length()/2;return a;}

test('all existing accepted islands and loose stones remain within their original placement envelopes',()=>{
  assert.deepEqual(islands,[0,1,2,3]);assert.equal(rocks.length,32);
  assert.equal(rocks.filter(r=>r.kind==='cobble').length,20);
  assert.deepEqual(landscapeRocks(),{rocks,islands});
  for(const r of rocks) {
    const [x,z,rx,h,rz]=LANDSCAPE_ROCK_SITES[r.island];let p=[x,h/2-.15,z],half=[rx*1.15,h/2,rz*1.15];
    if(r.kind==='cobble') {
      const k=Number(r.id.split('-').at(-1)),angle=k*2.4+r.island;
      p=[x+Math.cos(angle)*rx*.85,.7,z+Math.sin(angle)*rz*.85];half=[2.8,1.2,2.4];
    }
    for(const v of vertices(r))for(let axis=0;axis<3;axis++)assert.ok(Math.abs(v.getComponent(axis)+r.position[axis]-p[axis])<=half[axis]+.00001,r.id);
    if(r.kind!=='cobble')assert.ok(r.half[1]<Math.max(r.half[0],r.half[2]),`${r.id} becomes a pillar`);
  }
});

test('every visible solid is a closed outward convex hull with the exact collider source',()=>{
  let minVolumeRatio=Infinity,maxVolumeRatio=0;
  for(const r of rocks) {
    const {vs,planes}=shape(r),edges=new Map();let volume=0;
    const collider=landscapeRockCollider(r);assert.equal(collider.hull,r.hull);
    assert.deepEqual(collider.position,coasterWorld(r.position));
    for(let i=0;i<vs.length;i+=3) {
      volume+=vs[i].dot(vs[i+1].clone().cross(vs[i+2]))/6;
      assert.ok(vs[i+1].clone().sub(vs[i]).cross(vs[i+2].clone().sub(vs[i])).length()>1e-8);
      assert.ok(vs.every(v=>inside(v,[planes[i/3]],.00002)),`${r.id} nonconvex`);
      for(let j=0;j<3;j++) {
        const key=[vs[i+j],vs[i+(j+1)%3]].map(v=>v.toArray().map(n=>n.toFixed(5)).join(',')).sort().join('|');
        edges.set(key,(edges.get(key)??0)+1);
      }
    }
    assert.ok([...edges.values()].every(count=>count===2),`${r.id} open hull`);
    for(const v of vs)for(let i=0;i<3;i++)assert.ok(Math.abs(v.getComponent(i))<=collider.half[i]+1e-6);
    const ratio=volume/(8*r.half[0]*r.half[1]*r.half[2]);assert.ok(ratio>.2&&ratio<.82);
    minVolumeRatio=Math.min(minVolumeRatio,ratio);maxVolumeRatio=Math.max(maxVolumeRatio,ratio);
  }
  console.log(JSON.stringify({hulls:rocks.length,minVolumeRatio,maxVolumeRatio}));
});

test('each island has three actually intersecting strata with all roots below ground',()=>{
  let witnesses=0;
  for(const island of islands) {
    const group=rocks.filter(r=>r.island===island&&r.kind!=='cobble'),links=[],connected=new Set([0]);
    for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++) {
      const a=shape(group[i]),b=shape(group[j]);
      const overlap=(s,from,to,planes)=>s.vs.some(v=>inside(v.clone().add(new Vector3(...from.position)).sub(new Vector3(...to.position)),planes,-.01));
      if(overlap(a,group[i],group[j],b.planes)||overlap(b,group[j],group[i],a.planes))links.push([i,j]);
    }
    for(let pass=0;pass<3;pass++)for(const [a,b] of links)if(connected.has(a)||connected.has(b)){connected.add(a);connected.add(b);}
    assert.equal(connected.size,3,`island ${island} separated strata`);witnesses+=links.length;
  }
  for(const r of rocks)assert.ok(Math.abs(Math.min(...vertices(r).map(v=>v.y+r.position[1]))-(r.kind==='cobble'?-.18:-.15))<.000001);
  console.log(JSON.stringify({islands:islands.length,actualHullOverlapPairs:witnesses}));
});

test('mineral bands preserve the complete convex surface and match contact planes',()=>{
  let triangles=0,maxPlaneError=0,maxAreaError=0;
  for(const r of rocks) {
    const {vs,planes}=shape(r),parts=landscapeRockSurfaceParts(r);let renderedArea=0;
    try {for(const {geometry} of parts) {
      const p=geometry.attributes.position,paint=Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i).sub(new Vector3(...coasterWorld(r.position))));
      renderedArea+=area(paint);triangles+=p.count/3;
      for(const v of paint) {
        const distances=planes.map(f=>f.n.dot(v.clone().sub(f.p)));
        assert.ok(Math.max(...distances)<.00005,`${r.id} paint outside collision`);
        const error=Math.min(...distances.map(Math.abs));maxPlaneError=Math.max(error,maxPlaneError);assert.ok(error<.00005);
      }
    }}finally{parts.forEach(p=>p.geometry.dispose());}
    const error=Math.abs(renderedArea-area(vs));maxAreaError=Math.max(error,maxAreaError);assert.ok(error<.005,`${r.id} loses surface`);
  }
  console.log(JSON.stringify({renderedRockTriangles:triangles,maxPlaneError,maxAreaError}));
});

test('frozen guest routes and denser independent rail/head samples clear every rock envelope',()=>{
  assert.deepEqual(COASTER_CLIFF_WALK,[[16,.08,54],[45,.08,48],[60,5,32],[55,8.08,20],[55,8.08,14]]);
  assert.deepEqual(COASTER_INFIELD_WALK,[[16,.11,36],[25,1,34],[34,2.8,24],[32,3,16],[23,1.8,16],[17,.6,26]]);
  const boxes=rocks.map(bounds),routes=[
    {points:COASTER_CLIFF_WALK,width:2.7},
    {points:[...COASTER_INFIELD_WALK,COASTER_INFIELD_WALK[0]],width:2.1},
    ...[[[-39.5,.11,53],[-8.5,.11,53]],[[14,.11,53],[48,.11,53]],[[16,.11,33],[16,.11,53]],[[-18,.11,33],[-18,.11,51]]].map(points=>({points,width:1.5})),
  ];
  let pathSamples=0,minRailHeadDistance=Infinity;
  for(const {points,width} of routes)for(let i=1;i<points.length;i++)for(let sample=0;sample<=100;sample++) {
    const p=new Vector3(...coasterWorld(points[i-1])).lerp(new Vector3(...coasterWorld(points[i])),sample/100).add(new Vector3(0,.9,0));
    const envelope=new Box3(p.clone().sub(new Vector3(width+.35,.85,width+.35)),p.clone().add(new Vector3(width+.35,.85,width+.35)));
    for(let j=0;j<boxes.length;j++)assert.equal(boxes[j].intersectsBox(envelope),false,`${rocks[j].id} blocks guest corridor`);
    pathSamples++;
  }
  for(let i=0;i<2400;i++) {
    const frame=coasterFrame((i+.37)/2400);
    for(const p of [frame.point,frame.point.clone().addScaledVector(frame.up,2.2)])for(const box of boxes)minRailHeadDistance=Math.min(minRailHeadDistance,box.distanceToPoint(p));
  }
  assert.ok(minRailHeadDistance>1.7,`rail/head envelope clearance ${minRailHeadDistance}`);
  console.log(JSON.stringify({pathSamples,railSamples:2400,minRailHeadDistance}));
});

test('local emitter preserves near/far contacts and fits unchanged global ceilings',()=>{
  const counter=()=>{
    const batch=Object.create(CoasterBatch.prototype);batch.triangles=0;
    batch.add=function(g){this.triangles+=(g.index?.count??g.attributes.position.count)/3;g.dispose();};return batch;
  };
  const results=[];
  for(const detailed of [true,false]) {
    const steel=counter(),glow=counter(),colliders=[],art=addCoasterLandscape(steel,glow,colliders,detailed);
    assert.equal(art.islands,4);
    assert.equal(colliders.filter(c=>c.hull).length,32);
    assert.deepEqual(colliders.slice(0,32),rocks.map(landscapeRockCollider));
    results.push({triangles:steel.triangles+glow.triangles,colliders});
  }
  assert.deepEqual(results[0].colliders,results[1].colliders);
  // Independently counted pre-edit landscape at 30ba96f: 5656/4828 triangles and 41 colliders.
  const near=108736+results[0].triangles-5656,far=61412+results[1].triangles-4828;
  const sceneColliders=617+results[0].colliders.length-41;
  assert.ok(near<=114352);assert.ok(far<=67296);assert.ok(sceneColliders<650);
  console.log(JSON.stringify({nearLocal:results[0].triangles,farLocal:results[1].triangles,localColliders:results[0].colliders.length,
    derivedNear:near,derivedFar:far,derivedSceneColliders:sceneColliders,hullBytes:rocks.reduce((n,r)=>n+r.hull.byteLength,0)}));
});
