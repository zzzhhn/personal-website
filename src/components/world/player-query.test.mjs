import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createPlayerClearance,sweptPlayerVelocity} from './player-motion.ts';
const require=createRequire(import.meta.url);
const entry=require.resolve('@dimforge/rapier3d-compat',{paths:[require.resolve('@react-three/rapier')]});
const {default:RAPIER}=await import(entry);await RAPIER.init();

for(const kind of ['fixed','parentless','kinematic','prop','vehicle','sensor'])test(`clearance preserves ${kind} filtering and frees its borrowed body set`,()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,.5,5).setTranslation(0,-.5,0),floor);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.83,0).lockRotations());
  world.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setMass(72),body);
  let owner;
  if(kind!=='parentless'){
    const desc=kind==='kinematic'?RAPIER.RigidBodyDesc.kinematicPositionBased():['prop','vehicle'].includes(kind)?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed();
    owner=world.createRigidBody(desc);
    if(kind==='vehicle')owner.userData={vehicle:'coupe'};
    // Untagged loose bodies are deliberately covered, not just userData.obstacle props.
  }
  world.createCollider(RAPIER.ColliderDesc.cuboid(.05,1,2).setTranslation(1,1,0).setSensor(kind==='sensor'),owner);
  const controller=createPlayerClearance(world);world.step();
  try{
    const input={x:20,y:0,z:0};
    for(let i=0;i<20;i++){
      const v=sweptPlayerVelocity(controller,body,input,.1,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      if(['prop','sensor'].includes(kind))assert.equal(v,input,'loose props keep physical pushing and sensors stay transparent');
      else assert.ok(v.x<7,`${kind} must stop the capsule before x=1`);
    }
  }finally{assert.doesNotThrow(()=>{world.removeCharacterController(controller);world.free();});}
});

test('the clearance prepass stays local instead of scanning far bodies',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setMass(72),body);
  for(let i=0;i<20;i++){
    const far=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(100+i*3,1,100));
    world.createCollider(RAPIER.ColliderDesc.ball(.3),far);
    far.isDynamic=()=>{throw new Error('unrelated far body was scanned');};
  }
  world.forEachRigidBody=()=>{throw new Error('global body traversal is not allowed');};
  world.step();const controller=createPlayerClearance(world);
  try{assert.doesNotThrow(()=>sweptPlayerVelocity(controller,body,{x:3.6,y:0,z:0},1/60,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS));}
  finally{world.removeCharacterController(controller);world.free();}
});
