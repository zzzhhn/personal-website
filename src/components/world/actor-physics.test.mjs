import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { advanceTimer, cameraDistance, configureRaycastVehicle, heading, isUpsideDown, rotateVector, wheelGeometry, yawRotation } from './actor-physics.ts';
import { nearestRoadPoint, VEHICLES } from './layout.ts';

const require = createRequire(import.meta.url);
const rapierEntry = require.resolve('@dimforge/rapier3d-compat', { paths: [require.resolve('@react-three/rapier')] });
const { default: RAPIER } = await import(rapierEntry);
await RAPIER.init();

test('vehicle contract and recovery timers preserve orientation, pause and road elevation', () => {
  const front = rotateVector([1,0,0],yawRotation(Math.PI/2));
  assert.ok(Math.abs(front[0])<1e-9 && Math.abs(front[2]+1)<1e-9);
  assert.ok(Math.abs(heading(yawRotation(.75))-.75)<1e-9);
  assert.equal(isUpsideDown({x:1,y:0,z:0,w:0}),true);
  assert.equal(isUpsideDown(yawRotation(2)),false);
  assert.equal(advanceTimer(1.5,true,.5),2);
  assert.equal(advanceTimer(1.5,true,0),1.5);
  assert.equal(advanceTimer(1.5,false,.1),0);
  assert.equal(cameraDistance(false,0,0),12);
  assert.equal(cameraDistance(false,2,0),15);
  assert.equal(cameraDistance(true,0,0),18);
  assert.equal(cameraDistance(true,2,0),22);
  assert.equal(cameraDistance(true,2,100),27);
  const road=nearestRoadPoint([-14,-20,31.5]);
  assert.ok(road[1]>1.14 && road[1]<4.84,'ramp recovery retains interpolated surface height');
});

test('three Rapier chassis settle on four suspension rays, drive +X, brake and collide', () => {
  for (const spec of VEHICLES) {
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    world.timestep=1/60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(180,.5,30).setTranslation(0,-.5,0).setFriction(1));
    const g=wheelGeometry(spec.size);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,g.height,0).setLinearDamping(.12).setAngularDamping(.65));
    world.createCollider(RAPIER.ColliderDesc.cuboid(spec.size[0]/2,spec.size[1]*.29,spec.size[2]/2).setMass(spec.mass*.78),body);
    world.createCollider(RAPIER.ColliderDesc.cuboid(spec.size[0]*.25,spec.size[1]*.2,spec.size[2]*.43).setTranslation(-spec.size[0]*.08,spec.size[1]*.42,0).setMass(spec.mass*.22),body);
    const controller=world.createVehicleController(body);
    configureRaycastVehicle(controller,spec.size,spec.mass,spec.grip,spec.suspension/spec.mass);
    const step=(frames,force=0,brake=0)=>{
      for(let n=0;n<frames;n++){
        for(let i=0;i<4;i++){controller.setWheelEngineForce(i,force);controller.setWheelBrake(i,brake);}
        controller.updateVehicle(1/60,undefined,undefined,c=>c.parent()?.handle!==body.handle);
        world.step();
      }
    };
    step(120);
    assert.ok(Math.abs(body.mass()-spec.mass)<.01,`${spec.id}: chassis has intended mass`);
    assert.ok([0,1,2,3].every(i=>controller.wheelIsInContact(i)),`${spec.id}: four ray contacts`);
    assert.ok(body.translation().y>.4 && body.translation().y<g.height+.1,`${spec.id}: spring supports body`);
    const start=body.translation().x;
    step(120,spec.engineForce/4);
    assert.ok(body.translation().x>start+3,`${spec.id}: positive engine force drives +X`);
    const speed=body.linvel().x;
    assert.ok(speed>3,`${spec.id}: accelerates with real force`);
    step(90,0,spec.mass*.028);
    assert.ok(Math.abs(body.linvel().x)<speed*.35,`${spec.id}: brake dissipates forward motion`);
    const before=body.translation().x;
    world.createCollider(RAPIER.ColliderDesc.cuboid(.4,3,5).setTranslation(before+9,2,0).setRestitution(.2));
    step(180,spec.engineForce/4);
    assert.ok(body.translation().x<before+9,`${spec.id}: chassis collides with fixed obstruction`);
    world.removeVehicleController(controller);world.free();
  }
});
