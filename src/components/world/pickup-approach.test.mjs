import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { findPickupStand, pickupGroundRoute, pickupApproachMotion, pickupStandingRing, PICKUP_DISCOVERY_RADIUS } from './pickup-approach.ts';
import { interactableProxy, registerInteractable, nearestInteractable } from './WorldInteract.ts';
import { caveLampApproach, caveLampPickupReach } from './alpha-island/batch2/batch2-station-feedback.ts';
import { createCaveFloorGeometry } from './alpha-island/batch2/cave-art.ts';
import { CAVE_LAMP_HOME } from './alpha-island/batch2/cave-state.ts';
import { alphaPickupApproach, alphaActionTarget } from './alpha-island/alpha-action-reach.ts';
import { alphaGroundHeight, alphaTerrainData } from './alpha-island/alpha-terrain.ts';
import { alphaWorld } from './alpha-island/alpha-layout.ts';
import { playerSupport } from './player-ground.ts';
await R.init();
const H = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
function fixture(populate = () => {}, floor = true) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  if (floor) world.createCollider(R.ColliderDesc.cuboid(4,.1,4).setTranslation(0,-.1,0));
  populate(world);
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(1.6,H+.001,0).lockRotations());
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);
  world.step();
  return {world,body,from:()=>{const p=body.translation();return [p.x,p.y,p.z];},free:()=>world.free()};
}
const approach = {
  target: () => [0,1.15,0],
  ready: p => Math.hypot(p[0],p[2]) <= .6 && Math.abs(p[1]-H) < .05,
  candidates: p => pickupStandingRing([0,1.15,0],p,.5),
};

test('outer pickup discovery preserves its live approach descriptor and physical reach gate', () => {
  let called=0;
  const first={...approach},second={...approach};
  let current={id:'pickup-fixture',position:[0,1.15,0],radius:PICKUP_DISCOVERY_RADIUS,kind:'exhibit',
    label:{en:'Take lamp',zh:'取矿灯'},enabled:()=>true,approach:first,onInteract:()=>called++};
  const proxy=interactableProxy(current,()=>current),release=registerInteractable(proxy);
  try {
    assert.equal(nearestInteractable(1.7,H,0)?.item,proxy);
    assert.equal(proxy.approach.ready([1.7,H,0]),false);
    assert.equal(called,0);
    current={...current,approach:second};
    assert.equal(proxy.approach,second);
    current=null;
    assert.equal(proxy.approach,undefined);
    assert.equal(nearestInteractable(1.7,H,0),null);
  } finally {release();}
});

test('a short supported route finds a grip stance without moving the body', () => {
  const f=fixture();
  try {
    const before=f.from(),stand=findPickupStand(f.world,R,f.body,before,approach);
    assert.ok(stand);assert.equal(approach.ready(stand),true);assert.deepEqual(f.from(),before);
    assert.ok(Math.hypot(stand[0]-before[0],stand[2]-before[2])<1.2);
    const moving=pickupApproachMotion(before,stand,approach.target(),false);
    assert.ok(moving.vx<0);assert.ok(Math.hypot(moving.vx,moving.vz)<=1.35);
    const stopped=pickupApproachMotion(stand,stand,approach.target(),true);
    assert.equal(stopped.vx,0);assert.equal(stopped.vz,0);
    assert.deepEqual(findPickupStand(f.world,R,f.body,stand,approach),stand);
  } finally {f.free();}
});

test('a workstation can validate its explicit 2.1 m offer without widening ordinary pickup routes',()=>{
  const f=fixture();
  try{
    const candidate=[-.45,H,0];
    assert.equal(pickupGroundRoute(f.world,R,f.body,f.from(),candidate),null);
    assert.ok(pickupGroundRoute(f.world,R,f.body,f.from(),candidate,2.1));
    for(const limit of [NaN,Infinity,0,-1,4])assert.equal(pickupGroundRoute(f.world,R,f.body,f.from(),candidate,limit),null);
    f.world.createCollider(R.ColliderDesc.cuboid(.08,1,2).setTranslation(.6,1,0));f.world.step();
    assert.equal(pickupGroundRoute(f.world,R,f.body,f.from(),candidate,2.1),null);
  }finally{f.free();}
});

test('a full capsule wall or low ceiling prevents pickup approach', () => {
  for(const obstacle of [
    w=>w.createCollider(R.ColliderDesc.cuboid(.06,1,3).setTranslation(1,1,0)),
    w=>w.createCollider(R.ColliderDesc.cuboid(.7,.1,.7).setTranslation(0,1.4,0)),
  ]) {
    const f=fixture(obstacle);
    try {assert.equal(findPickupStand(f.world,R,f.body,f.from(),approach),null);}
    finally {f.free();}
  }
});

test('a floor gap, steep slope and raised storey are never used as pickup shortcuts', () => {
  const gap=fixture(w=>{
    w.createCollider(R.ColliderDesc.cuboid(.4,.1,2).setTranslation(1.75,-.1,0));
    w.createCollider(R.ColliderDesc.cuboid(.35,.1,2).setTranslation(.25,-.1,0));
  },false);
  try {assert.equal(pickupGroundRoute(gap.world,R,gap.body,gap.from(),[.5,H,0]),null);}
  finally {gap.free();}
  const upper=fixture(w=>w.createCollider(R.ColliderDesc.cuboid(.4,.1,2).setTranslation(.2,.7,0)));
  try {assert.equal(pickupGroundRoute(upper.world,R,upper.body,upper.from(),[.3,H+.8,0]),null);}
  finally {upper.free();}
  const slope=fixture(w=>{
    const a=35*Math.PI/180;
    w.createCollider(R.ColliderDesc.cuboid(2,.1,2).setTranslation(0,-.1,0)
      .setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)}));
  },false);
  try {
    const a=35*Math.PI/180;
    slope.body.setTranslation({x:1.6,y:1.6*Math.tan(a)+PLAYER_HALF_HEIGHT+PLAYER_RADIUS/Math.cos(a),z:0},true);
    slope.world.step();
    assert.equal(pickupGroundRoute(slope.world,R,slope.body,slope.from(),[.5,H,0]),null);
  }
  finally {slope.free();}
});

test('lamp approach uses the real front standing strip instead of widening hand reach', () => {
  const hook=[0,1.15,0],lamp=caveLampApproach(hook);
  assert.equal(caveLampPickupReach([1.6,H,0],hook,true),false);
  for(const stand of lamp.candidates([1.6,H,0])) {
    assert.equal(lamp.ready(stand),true);
    assert.ok(stand[0]>=.43&&stand[0]<=.6);
    assert.ok(Math.abs(stand[2])<=.25);
  }
  assert.equal(lamp.ready([-.5,H,0]),false);
});

function supportedActor(world, x, z, surfaceY) {
  const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,surfaceY+H+.2,z).lockRotations());
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);
  world.step();
  const floor=playerSupport(world,R,body,body.translation(),true,.8);
  assert.ok(floor,'the natural approach must have a real walkable floor');
  body.setTranslation({x,y:floor.centerY+.001,z},true);body.setLinvel({x:0,y:0,z:0},true);world.step();
  return body;
}
const bodyPosition=body=>{const p=body.translation();return [p.x,p.y,p.z];};

test('the actual cave floor and rack colliders admit a short natural lamp approach', () => {
  const geometry=createCaveFloorGeometry(),positions=geometry.attributes.position.array,indices=geometry.index.array;
  const world=new R.World({x:0,y:-9.81,z:0});
  try {
    world.createCollider(R.ColliderDesc.trimesh(new Float32Array(positions),new Uint32Array(indices)));
    world.createCollider(R.ColliderDesc.cuboid(.41,.18,.375).setTranslation(CAVE_LAMP_HOME[0],CAVE_LAMP_HOME[1]+.18,CAVE_LAMP_HOME[2]));
    world.createCollider(R.ColliderDesc.cuboid(.08,.68,.08).setTranslation(CAVE_LAMP_HOME[0],CAVE_LAMP_HOME[1]+.98,CAVE_LAMP_HOME[2]));
    const hook=[CAVE_LAMP_HOME[0]+.32,CAVE_LAMP_HOME[1]+1.48,CAVE_LAMP_HOME[2]];
    const body=supportedActor(world,hook[0]+1.6,hook[2],CAVE_LAMP_HOME[1]+.35),from=bodyPosition(body);
    const lamp=caveLampApproach(hook),stand=findPickupStand(world,R,body,from,lamp);
    assert.equal(lamp.ready(from),false);assert.ok(stand,'natural lamp-side discovery must find a supported grip stance');
    assert.equal(lamp.ready(stand),true);assert.deepEqual(bodyPosition(body),from);
    assert.ok(stand[0]-(CAVE_LAMP_HOME[0]+.41)>=PLAYER_RADIUS-.001,'preserve the rack base collision');
  } finally {world.free();geometry.dispose();}
});

function addActualTerrainPatch(world,x,z) {
  // Share alphaGroundHeight's exact cached Float32 source, but allocate only this small collider.
  const data=alphaTerrainData(),vertices=[],indices=[];
  const ci=Math.floor((x+98)/196*data.nx),cj=Math.floor((z+114)/228*data.nz),size=9;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++) {
    const k=((cj-4+j)*(data.nx+1)+ci-4+i)*3;
    vertices.push(...alphaWorld(Array.from(data.positions.subarray(k,k+3))));
  }
  for(let j=0;j<size-1;j++)for(let i=0;i<size-1;i++) {
    const a=j*size+i;indices.push(a,a+size,a+1,a+1,a+size,a+size+1);
  }
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)));
}
test('actual Alpha terrain triangles offer short wind, lantern and mineral-stone approach routes', () => {
  for(const [kind,wind] of [['wind',0],['wind',1],['wind',2],['lantern',0],['stone',0]]) {
    const world=new R.World({x:0,y:-9.81,z:0});
    try {
      const target=alphaActionTarget(kind,wind),x=target[0]+(kind==='wind'?1.5:kind==='stone'?1.45:0),
        z=target[2]+(kind==='lantern'?-1.6:kind==='stone'?-.325:0);
      addActualTerrainPatch(world,target[0],target[2]);
      const start=alphaWorld([x,alphaGroundHeight(x,z),z]);
      const body=supportedActor(world,start[0],start[2],start[1]),from=bodyPosition(body);
      const pickup=alphaPickupApproach(kind,wind),stand=findPickupStand(world,R,body,from,pickup);
      assert.equal(pickup.ready(from),false,`${kind}/${wind} discovery must be outside hand reach`);
      assert.ok(stand,`${kind}/${wind} must find a supported grip stance`);
      assert.equal(pickup.ready(stand),true);assert.deepEqual(bodyPosition(body),from);
    } finally {world.free();}
  }
});
