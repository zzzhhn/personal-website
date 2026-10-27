import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { createCoasterStructure, createCoasterCar } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { COASTER_INFIELD_WALK } from './coaster-terrain-relief.ts';
import { coasterWorld } from './coaster-track.ts';

test('the whole infield sample adds at most 20k triangles to the frozen tower candidate',()=>{
  const car=createCoasterCar();
  try{for(const detailed of [true,false]){
    const g=createCoasterStructure(detailed);
    try{
      const total=(g.steel.attributes.position.count+g.glow.attributes.position.count)/3+car.attributes.position.count;
      const baseline=detailed?94352:47296;
      assert.ok(total-baseline<=20000,`${detailed?'near':'far'} adds ${total-baseline} triangles`);
      assert.equal(g.steel.groups.length,0);assert.equal(g.glow.groups.length,0);
      for(const geo of [g.steel,g.glow])for(const a of Object.values(geo.attributes))assert.ok(a.array.every(Number.isFinite));
      console.log(JSON.stringify({detailed,total,baseline,increment:total-baseline,terrain:g.relief.triangleCount,trees:g.art.trees,shrubs:g.art.shrubs,colliders:g.colliders.length}));
    }finally{g.steel.dispose();g.glow.dispose();}
  }}finally{car.dispose();}
});

test('a player-sized physical capsule completes the garden loop against the actual terrain and scene colliders',async()=>{
  await R.init();
  const g=createCoasterStructure(true),world=new R.World({x:0,y:0,z:0});
  try{
    world.createCollider(R.ColliderDesc.trimesh(g.relief.vertices,g.relief.indices));
    world.createCollider(R.ColliderDesc.cuboid(80,.5,120).setTranslation(50,.5,-195));
    for(const c of g.colliders) world.createCollider(coasterColliderDescriptor(R, c));
    const first=COASTER_INFIELD_WALK[0],start=coasterWorld([first[0],first[1]+.87,first[2]]);
    const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...start));
    const collider=world.createCollider(R.ColliderDesc.capsule(.48,.34),body);
    const controller=world.createCharacterController(.015);controller.enableSnapToGround(.35);controller.setMaxSlopeClimbAngle(Math.PI/12);
    let grounded=0,steps=0;
    world.step();
    for(const target of [...COASTER_INFIELD_WALK.slice(1),first]){
      const [x,,z]=coasterWorld(target);let reached=false;
      for(let frame=0;frame<400;frame++){
        const p=body.translation(),dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);
        if(d<.12){reached=true;break;}
        const scale=Math.min(.08,d)/d;
        controller.computeColliderMovement(collider,{x:dx*scale,y:-.12,z:dz*scale},undefined,undefined,c=>c.handle!==collider.handle);
        const move=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+move.x,y:p.y+move.y,z:p.z+move.z});world.step();
        steps++;if(controller.computedGrounded())grounded++;
      }
      assert.ok(reached,`capsule blocked en route to ${target}: ${JSON.stringify(body.translation())}`);
    }
    assert.ok(grounded/steps>.95,`${grounded}/${steps} grounded frames`);
    assert.ok(Math.abs(body.translation().y-(coasterWorld(first)[1]+.82))<.18);
    console.log(JSON.stringify({gardenLoopPhysicsSteps:steps,groundedFrames:grounded}));
  }finally{world.free();g.steel.dispose();g.glow.dispose();}
});
