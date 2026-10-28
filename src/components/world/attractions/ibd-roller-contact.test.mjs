import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
import { IBD_STATIONS } from './ibd-yard-layout.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';
import { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } from '../player-motion.ts';
import { playerSupport, followPlayerGround } from '../player-ground.ts';

await RAPIER.init();
// Build this facility's geometry once; no scene, browser, renderer, or world-wide rebuild.
const data=buildIbdStatic(),baseVertices=1618,baseTriangles=3093;
const rollerVertices=data.walkSurface.vertices.slice(baseVertices*3);
const rollerIndices=data.walkSurface.indices.slice(baseTriangles*3).map(i=>i-baseVertices);
const identity={x:0,y:0,z:0,w:1},dt=1/60;
const capsule=new RAPIER.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
after(()=>data.geometry.dispose());
function fixture(all=false) {
  const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=dt;
  if(all) {
    for(const s of data.solids)world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size.map(v=>v/2)).setTranslation(...s.at)
      .setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation??[0,0,0])))));
    world.createCollider(RAPIER.ColliderDesc.trimesh(data.walkSurface.vertices,data.walkSurface.indices).setFriction(.85));
  } else {
    world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,30).setTranslation(14,-.01,0));
    world.createCollider(RAPIER.ColliderDesc.trimesh(rollerVertices,rollerIndices).setFriction(.85));
  }
  world.step();return world;
}
function walk(world,start,velocity,steps=180) {
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start[0],.1+PLAYER_CENTER_HEIGHT,start[1])
    .setGravityScale(12.5/9.81).setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false).lockRotations());
  world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),body);
  const clearance=createPlayerClearance(world);let highest=0;
  try {
    for(let i=0;i<steps;i++) {
      const v=body.linvel(),grounded=playerSupport(world,RAPIER,body)?.grounded??false;
      const change=playerVelocityChange(v,{x:velocity[0],y:0,z:velocity[1]},dt,grounded),mass=body.mass();
      body.applyImpulse({x:change.x*mass,y:0,z:change.z*mass},true);
      body.setLinvel(sweptPlayerVelocity(clearance,body,body.linvel(),dt,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS),true);
      followPlayerGround(world,RAPIER,body,body.linvel(),dt,false);world.step();
      highest=Math.max(highest,body.translation().y);
    }
    return {...body.translation(),highest};
  } finally {world.removeCharacterController(clearance);world.removeRigidBody(body);}
}

test('all 20 rollers and eight side bars reuse exact closed visual triangles without extra colliders',()=>{
  assert.equal(data.solids.length,257);
  // Near-field truck/control detail may evolve; the contact mesh must still reuse the exact bars.
  assert.ok(data.geometry.index.count/3 < 40000, 'static yard stays within its geometry allocation');
  assert.equal(rollerVertices.length/3,832);assert.equal(rollerIndices.length/3,720);
  const p=data.geometry.attributes.position,idx=data.geometry.index;
  const key=(a,b,c)=>[a,b,c].map(v=>v.join(',')).sort().join('|'),visual=new Set();
  for(let i=0;i<idx.count;i+=3)visual.add(key(...[0,1,2].map(k=>[p.getX(idx.getX(i+k)),p.getY(idx.getX(i+k)),p.getZ(idx.getX(i+k))])));
  const edges=new Map();
  for(let i=0;i<rollerIndices.length;i+=3) {
    const points=[0,1,2].map(k=>Array.from(rollerVertices.slice(rollerIndices[i+k]*3,rollerIndices[i+k]*3+3)));
    assert.ok(visual.has(key(...points)),'contact face differs from render face');
    for(let k=0;k<3;k++) {const edge=[points[k].join(','),points[(k+1)%3].join(',')].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n===2),'bar end caps must be closed');
});

test('ordinary dynamic capsules stop at both long and short roller banks from the side and ends',()=>{
  const world=fixture();const stops=[];
  try {for(const x of [10,18])for(const [z,start,end] of [[-4.8,-8.2,-3.4],[5.8,5,6.6]]) {
    for(const sign of [-1,1]) {
      const p=walk(world,[x+sign*3.5,z],[-sign*3.6,0]);
      assert.ok(sign*(p.x-x)>2.08,`${x}/${z}/${sign}: enters side rail ${p.x}`);
      assert.ok(sign*(p.x-x)<2.2,`${x}/${z}/${sign}: stopped by an air wall ${p.x}`);
      assert.ok(p.highest<1.06,'ordinary walking must not climb the raised roller');stops.push(p.x);
    }
    for(const [from,direction,bound] of [[start-2,1,start-.13-PLAYER_RADIUS],[end+2,-1,end+.13+PLAYER_RADIUS]]) {
      const p=walk(world,[x,from],[0,direction*3.6]);
      assert.ok(direction*(p.z-bound)<.02,`${x}/${z}: crosses end roller at ${p.z}`);
      assert.ok(Math.abs(p.z-bound)<.1,'contact remains close to visible roller');
    }
  }}finally{world.free();}
  console.log(JSON.stringify({dynamicApproaches:16,sideStopRange:[Math.min(...stops),Math.max(...stops)]}));
});

test('open crosswalks, lever standing points and side approaches remain traversable',()=>{
  const world=fixture(true);
  try {
    for(const z of [0,4])for(const direction of [-1,1]) {
      const p=walk(world,[direction>0?6:22,z],[direction*3.6,0],300);
      assert.ok(direction>0?p.x>22:p.x<6,`crosswalk z=${z} blocked: ${p.x}`);
    }
    for(const [x,z] of [[7.8,-5.8],[20.2,-5.8],[21.69,-4.69],[7,-5.8]]) {
      let hit=false;world.intersectionsWithShape({x,y:.1+PLAYER_CENTER_HEIGHT,z},identity,capsule,()=>{hit=true;return false;});
      assert.equal(hit,false,`lever stance ${x},${z} blocked`);
    }
    for(const [x,id] of [[7.8,'load-a'],[20.2,'load-b']]) {
      const p=walk(world,[x,0],[0,-3.6],110),station=IBD_STATIONS.find(s=>s.id===id);
      assert.ok(p.z<-4.6&&Math.hypot(p.x-station.at[0],p.z-station.at[2])<1.4,`${id} cannot be approached: ${JSON.stringify(p)}`);
    }
  }finally{world.free();}
});

test('gaps below and between visible bars contain no filled-in collision wall',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});
  try {
    world.createCollider(RAPIER.ColliderDesc.trimesh(rollerVertices,rollerIndices));world.step();
    for(const x of [10,18]) {
      assert.equal(world.castShape({x:x-3,y:.3,z:-4.8},identity,{x:1,y:0,z:0},new RAPIER.Ball(.06),0,6,true),null);
      assert.equal(world.castShape({x,y:1.3,z:-7.8},identity,{x:0,y:-1,z:0},new RAPIER.Ball(.06),0,1.2,true),null);
      assert.ok(world.castShape({x,y:1.3,z:-8.2},identity,{x:0,y:-1,z:0},new RAPIER.Ball(.06),0,1.2,true));
    }
  }finally{world.free();}
});

test('full-size moving cargo clears the exact rollers throughout load, unload and replacement',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=dt;
  const rollers=world.createCollider(RAPIER.ColliderDesc.trimesh(rollerVertices,rollerIndices));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const cargo=world.createCollider(RAPIER.ColliderDesc.cuboid(1.4,.55,1.3).setTranslation(0,.45,0),body);
  let samples=0;
  try {for(const slot of ['parts-a','parts-b'])for(const kind of ['load','unload','replace'])for(const incoming of kind==='replace'?[false,true]:[false]) {
    const game=createIbdYardGame();game.pending={token:1,seconds:3,action:{kind,slot,station:slot==='parts-a'?'load-a':'load-b'}};
    let previous;
    for(let i=0;i<=240;i++) {
      const pose=ibdPhysicalCargoPose(game,slot,i/240,incoming),[x,y,z]=pose.at;
      if(i===0)body.setTranslation({x,y,z},true);else body.setNextKinematicTranslation({x,y,z});
      world.step();const at=cargo.translation();
      assert.ok(Math.hypot(at.x-x,at.y-y-.45,at.z-z)<.00001,'actual moving collider follows unchanged route');
      let hit=false;
      world.intersectionsWithShape(at,cargo.rotation(),cargo.shape,c=>{if(c.handle===rollers.handle)hit=true;return true;});
      assert.equal(hit,false,`${slot}/${kind}/${incoming} contacts roller at ${i/240}`);
      if(previous) {
        const swept=world.castShape(previous,identity,{x:at.x-previous.x,y:at.y-previous.y,z:at.z-previous.z},cargo.shape,0,1,true,
          undefined,undefined,cargo,body,c=>c.handle===rollers.handle);
        assert.equal(swept,null,`${slot}/${kind} sweeps a roller between samples`);
      }
      previous=at;samples++;
    }
  }}finally{world.free();}
  console.log(JSON.stringify({fullSizeCargoSamples:samples,colliderIncrement:0,contactTriangleIncrement:rollerIndices.length/3}));
});
