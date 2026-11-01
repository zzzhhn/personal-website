import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Euler, Quaternion, Ray, Vector3 } from 'three';
import { addCoasterLookoutSample, coasterLookoutSolids, createLookoutRockGeometry, lookoutRockSurfaceParts,
  lookoutSampleBudget, lookoutSolidCollider, lookoutSolidMatrix, LOOKOUT_BED_COLOURS } from './coaster-lookout-sample.ts';
import { addCoasterCliffs, COASTER_CLIFF_WALK, COASTER_LOOKOUT } from './coaster-landscape-cliffs.ts';
import { CoasterBatch } from './coaster-geometry.ts';
import { coasterFrame, coasterRidePose, coasterWorld } from './coaster-track.ts';

const solids=coasterLookoutSolids(),rocks=solids.filter(s=>s.hull);
const solidBounds=s=>new Box3(new Vector3(...s.size).multiplyScalar(-.5),new Vector3(...s.size).multiplyScalar(.5)).applyMatrix4(lookoutSolidMatrix(s));
function shape(s,world=false) {
  const g=createLookoutRockGeometry(s);if(world)g.applyMatrix4(lookoutSolidMatrix(s));
  const vertices=Array.from({length:g.attributes.position.count},(_,i)=>new Vector3().fromBufferAttribute(g.attributes.position,i));
  const planes=vertices.filter((_,i)=>i%3===0).map((v,i)=>({p:v,n:new Vector3().fromBufferAttribute(g.attributes.normal,i*3)}));
  g.dispose();return {vertices,planes};
}
const inside=(p,planes,margin=0)=>planes.every(f=>f.n.dot(p.clone().sub(f.p))<=margin);
function area(vertices) {let sum=0;for(let i=0;i<vertices.length;i+=3)sum+=vertices[i+1].clone().sub(vertices[i]).cross(vertices[i+2].clone().sub(vertices[i])).length()/2;return sum;}

test('the public top surfaces, route and architectural members retain their bounds',()=>{
  assert.deepEqual(COASTER_CLIFF_WALK,[[16,.08,54],[45,.08,48],[60,5,32],[55,8.08,20],[55,8.08,14]]);
  assert.deepEqual(COASTER_LOOKOUT,{center:[55,7.88,14],size:[12,.4,12]});
  assert.equal(solids.filter(s=>!s.hull).length,52);
  for(let i=1;i<COASTER_CLIFF_WALK.length;i++) {
    const a=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i-1])),b=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i]));
    for(let sample=0;sample<=80;sample++) {
      const center=a.clone().lerp(b,sample/80).add(new Vector3(0,.9,0));
      for(const s of solids) {
        const c=lookoutSolidCollider(s),inverse=new Quaternion().setFromEuler(new Euler(...c.rotation)).invert();
        const d=center.clone().sub(new Vector3(...c.position)).applyQuaternion(inverse);
        assert.ok(Math.abs(d.x)>=c.half[0]+.35-1e-6||Math.abs(d.y)>=c.half[1]+.85-1e-6||Math.abs(d.z)>=c.half[2]+.35-1e-6,`${s.id} blocks route ${i}:${sample}`);
      }
    }
  }
  for(const s of rocks)assert.ok(solidBounds(s).max.y<=coasterWorld([0,7.6,0])[1]+.00001,s.id);
});

test('rock envelopes preserve the original ride/rider clearance and three camera sight lines',()=>{
  const boxes=rocks.map(solidBounds),ray=new Ray(),hit=new Vector3();let minimum=Infinity;
  for(let i=0;i<1800;i++) {
    const u=(i+.31)/1800,f=coasterFrame(u),head=f.point.clone().addScaledVector(f.up,2.2);
    for(const box of boxes)for(const point of [f.point,head])minimum=Math.min(minimum,box.distanceToPoint(point));
    for(const mode of ['chase','comfort','first-person']) {
      const pose=coasterRidePose(u,mode),eye=new Vector3(...pose.cameraPosition);
      for(const target of mode==='first-person'?[new Vector3(...pose.cameraTarget)]:[head,new Vector3(...pose.cameraTarget)]) {
        const direction=target.clone().sub(eye),length=direction.length();ray.set(eye,direction.normalize());
        for(const box of boxes) {const result=ray.intersectBox(box,hit);assert.ok(!result||result.distanceTo(eye)>length,`${mode} blocked at ${u}`);}
      }
    }
  }
  assert.ok(minimum>1.7,`rail/rider clearance ${minimum}`);console.log(JSON.stringify({rideSamples:1800,minRailRiderToRockEnvelope:minimum}));
});

test('each closed convex surface is the exact local hull output, enclosed by half',()=>{
  const ratios=[];
  for(const s of rocks) {
    const c=lookoutSolidCollider(s),g=createLookoutRockGeometry(s),{vertices,planes}=shape(s),edges=new Map();
    assert.equal(c.hull,s.hull);assert.deepEqual(g.attributes.position.array,c.hull);g.dispose();
    let volume=0;
    for(let i=0;i<vertices.length;i+=3) {
      volume+=vertices[i].dot(vertices[i+1].clone().cross(vertices[i+2]))/6;
      for(const v of vertices)assert.ok(planes[i/3].n.dot(v.clone().sub(vertices[i]))<.00002,`${s.id} is not convex`);
      for(let j=0;j<3;j++) {
        const a=vertices[i+j].toArray().map(v=>v.toFixed(5)).join(','),b=vertices[i+(j+1)%3].toArray().map(v=>v.toFixed(5)).join(','),key=[a,b].sort().join('|');
        edges.set(key,(edges.get(key)??0)+1);
      }
    }
    assert.ok([...edges.values()].every(n=>n===2),`${s.id} has an open edge`);
    for(const v of vertices)for(let k=0;k<3;k++)assert.ok(Math.abs(v.getComponent(k))<=c.half[k]+.000001,`${s.id} escapes half`);
    const ratio=volume/(s.size[0]*s.size[1]*s.size[2]);ratios.push(ratio);
    assert.ok(ratio>.15&&ratio<.82,`${s.id} remains essentially a box: ${ratio}`);
  }
  for(const s of solids.filter(s=>!s.hull))assert.equal(lookoutSolidCollider(s).hull,undefined);
  console.log(JSON.stringify({hullCount:rocks.length,hullToEnvelopeVolumeRange:[Math.min(...ratios),Math.max(...ratios)]}));
});

test('actual convex stones overlap, and the crown directly meets all three cornices',()=>{
  const shapes=rocks.map(s=>shape(s,true)),connected=new Set([0]),links=[];
  for(let i=0;i<rocks.length;i++)for(let j=i+1;j<rocks.length;j++) {
    // A hull vertex strictly inside the other hull is a concrete overlap witness, not an AABB guess.
    if(shapes[i].vertices.some(v=>inside(v,shapes[j].planes,-.01))||shapes[j].vertices.some(v=>inside(v,shapes[i].planes,-.01)))links.push([i,j]);
  }
  for(let pass=0;pass<rocks.length;pass++)for(const [a,b] of links)if(connected.has(a)||connected.has(b)){connected.add(a);connected.add(b);}
  assert.equal(connected.size,rocks.length,rocks.filter((_,i)=>!connected.has(i)).map(s=>s.id).join(','));
  const crown=shapes[rocks.findIndex(s=>s.id==='crown-stratum')];
  for(const s of solids.filter(s=>s.id.startsWith('cornice-')))
    assert.ok(crown.vertices.some(v=>solidBounds(s).containsPoint(v)),`${s.id} floats over the rock`);
  console.log(JSON.stringify({actualHullOverlapLinks:links.length,connectedHulls:connected.size}));
});

test('bedding colours subdivide the same convex surface without changing its area or collision',()=>{
  let partsCount=0,triangles=0,maxError=0;
  const colours=new Set();
  for(const s of rocks) {
    const canonical=shape(s,true),parts=lookoutRockSurfaceParts(s);let renderedArea=0;
    try {for(const {geometry,colour} of parts) {
      const p=geometry.attributes.position;if(!p.count)continue;
      colours.add(colour);partsCount++;triangles+=p.count/3;
      const vertices=Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i));
      renderedArea+=area(vertices);
      for(const v of vertices) {
        const distances=canonical.planes.map(f=>f.n.dot(v.clone().sub(f.p)));
        assert.ok(Math.max(...distances)<.00005,`${s.id} paint leaves the hull`);
        const error=Math.min(...distances.map(Math.abs));maxError=Math.max(maxError,error);assert.ok(error<.00005);
      }
    }}finally{parts.forEach(p=>p.geometry.dispose());}
    assert.ok(Math.abs(renderedArea-area(canonical.vertices))<.003,`${s.id} colour clipping changes surface area`);
  }
  assert.ok(colours.size>=6);assert.ok(colours.size<=LOOKOUT_BED_COLOURS.length);
  console.log(JSON.stringify({colours:colours.size,paintParts:partsCount,rockTriangles:triangles,maxPaintToHullPlaneError:maxError}));
});

test('local rendering emits the same hulls and retains all architecture and the arrival opening',()=>{
  const emitted=[],colliders=[],glowBoxes=[];
  addCoasterLookoutSample({add(g){emitted.push(g);}},{box(...args){glowBoxes.push(args);}},colliders);
  try {
    assert.equal(colliders.length,solids.length);assert.equal(glowBoxes.length,3);
    assert.deepEqual(colliders,solids.map(lookoutSolidCollider));
    assert.equal(emitted.reduce((sum,g)=>sum+g.attributes.position.count/3,0),lookoutSampleBudget().triangles);
    const arrival=new Box3(new Vector3(...coasterWorld([52.4,8.08,18])),new Vector3(...coasterWorld([57.6,10.08,21])));
    for(const s of solids.filter(s=>!s.hull))assert.equal(solidBounds(s).intersectsBox(arrival),false,s.id);
    assert.equal(solids.filter(s=>s.id.startsWith('post-')&&!s.id.startsWith('post-cap-')).length,19);
    assert.equal(solids.filter(s=>s.role==='rail').length,9);
    assert.equal(solids.filter(s=>s.id.startsWith('shoe-')).length,4);
    assert.equal(solids.filter(s=>s.id.startsWith('post-cap-')).length,4);
  }finally{emitted.forEach(g=>g.dispose());}
});

test('integrated local counts fit the unchanged whole-scene geometry and collider ceilings',()=>{
  const counter=()=>{
    const c=Object.create(CoasterBatch.prototype);c.triangles=0;
    c.add=function(g){this.triangles+=(g.index?.count??g.attributes.position.count)/3;g.dispose();};return c;
  };
  const steel=counter(),glow=counter(),colliders=[];addCoasterCliffs(steel,glow,colliders);
  const total=steel.triangles+glow.triangles;
  // a1223b0 local module: 2,226 triangles/24 colliders. Recorded scene 106,172 + the
  // independently counted 64-triangle walk-end correction = 106,236, including three cars.
  const near=106236+total-2226,far=58912+total-2226,sceneColliders=559+colliders.length-24;
  assert.ok(near<=114352);assert.ok(far<=67296);assert.ok(sceneColliders<650);
  assert.equal(colliders.filter(c=>c.surface).length,6);assert.equal(colliders.filter(c=>c.hull).length,12);
  const budget=lookoutSampleBudget();assert.ok(budget.vertexAttributeBytes<600000);
  console.log(JSON.stringify({...budget,localTriangles:total,localColliders:colliders.length,derivedNear:near,derivedFar:far,derivedSceneColliders:sceneColliders,
    hullBytes:rocks.reduce((n,s)=>n+s.hull.byteLength,0)}));
});
