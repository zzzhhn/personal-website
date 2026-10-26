import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPlayerClearance, findLowVault, playerRouteClear, playerVelocityChange, sweptPlayerVelocity } from './player-motion.ts';
await RAPIER.init();

test('ordinary start, braking, reversal and air response retain the 3cb1f25 baseline', () => {
  // Fixed oracles calculated from the baseline WorldActors controller before the phase-2 experiment.
  for (const [speed, target, grounded, expected] of [
    [0, 6.2, true, .13333333333333333], [2.7, 6.2, true, .13333333333333333],
    [3.6, 0, true, -.6525692889192655], [6.2, 0, true, -1.1238693309165126],
    [6.2, -6.2, true, -2.2477386618330253], [4, -4, false, -.3901646039942879],
  ]) {
    const change = playerVelocityChange({ x: speed, y: 0, z: 0 }, { x: target, y: 0, z: 0 }, 1 / 60, grounded);
    assert.ok(Math.abs(change.x - expected) < 1e-12); assert.equal(change.z, 0);
  }
});

function scene({ height = .45, width = .12, landing = true, ceiling = false, sensor = false, dynamic = false } = {}) {
  const world = new RAPIER.World({ x: 0, y: -12.5, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(landing ? 5 : .7, .5, 3).setTranslation(0, -.5, 0));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .823, 0).lockRotations().setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48, .34), body);
  const obstacleBody = world.createRigidBody((dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed()).setTranslation(.95, height / 2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 2).setSensor(sensor), obstacleBody);
  if (ceiling) world.createCollider(RAPIER.ColliderDesc.cuboid(3, .1, 3).setTranslation(0, 2, 0));
  world.step();
  return { world, body, plan: () => findLowVault(world, RAPIER, body, { x: 1, y: 0, z: 0 }, -2) };
}

test('low rail uses a real collision-enabled ballistic flight and lands beyond it', () => {
  const { world, body, plan } = scene();
  const hop = plan(); assert.ok(hop, 'thin 45 cm rail has a safe full-capsule path');
  body.setLinvel({ x: hop.vx, y: hop.vy, z: hop.vz }, true);
  let peak = 0;
  for (let i = 0; i < 75; i++) { world.step(); peak = Math.max(peak, body.translation().y - .82); }
  assert.ok(body.translation().x > 1.5, 'cleared the obstacle');
  assert.ok(peak > .6 && peak < .8, `peak ${peak}`);
  assert.ok(Math.abs(body.translation().y - .82) < .02, 'grounded again');
  world.free();
});

for (const [name, options] of Object.entries({ tall: { height: 1.2 }, thick: { width: 2 }, cliff: { landing: false }, ceiling: { ceiling: true }, sensor: { sensor: true }, moving: { dynamic: true } })) {
  test(`vault rejects ${name} and leaves ordinary jump available`, () => {
    const { world, plan } = scene(options); assert.equal(plan(), null); world.free();
  });
}

for (const vehicle of [false, true]) {
  test(`a valid fixed rail cannot vault into an awake ${vehicle ? 'vehicle' : 'prop'}`, () => {
    const { world, plan } = scene();
    assert.ok(plan(), 'the rail has a valid path before inserting the blocker');
    const blocker = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1.9, .4, 0));
    blocker.userData = vehicle ? { vehicle: 'qa' } : { obstacle: 'qa' };
    world.createCollider(RAPIER.ColliderDesc.cuboid(.2, .4, 1), blocker);
    world.step(); assert.equal(blocker.isSleeping(), false);
    assert.equal(plan(), null, 'all solid blockers participate even when they cannot trigger the vault');
    world.free();
  });
}

function passage(width = .74) {
  const world = new RAPIER.World({ x:0,y:-12.5,z:0 });
  world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(8,.5,8).setTranslation(0,-.5,0));
  for (const side of [-1,1]) world.createCollider(RAPIER.ColliderDesc.cuboid(3,1,.1).setTranslation(2,1,side*(width/2+.1)));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2,.823,0).lockRotations().setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setFriction(0),body);
  world.step();
  const controller=createPlayerClearance(world);
  const step=(velocity) => {
    body.setLinvel(sweptPlayerVelocity(controller,body,velocity,1/60,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS),true);
    world.step();
  };
  const free=()=>{world.removeCharacterController(controller);world.free();};
  return {world,body,controller,step,free};
}

test('sprint traverses a 74 cm passage without widening the existing capsule',()=>{
  const p=passage(.74);
  for(let i=0;i<80;i++)p.step({x:6.2,y:p.body.linvel().y,z:0});
  assert.ok(p.body.translation().x>5.8,JSON.stringify(p.body.translation()));p.free();
});
test('64 cm passage remains solid under sustained sprint input',()=>{
  const p=passage(.64);
  for(let i=0;i<120;i++)p.step({x:6.2,y:p.body.linvel().y,z:0});
  assert.ok(p.body.translation().x<-.9,JSON.stringify(p.body.translation()));p.free();
});
test('thin wall sweep prevents tunneling, slides tangentially and allows moving away',()=>{
  const p=passage(8);
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,2,4).setTranslation(-1,1,0));p.world.step();
  const v=sweptPlayerVelocity(p.controller,p.body,{x:80,y:0,z:8},1/60,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  assert.ok(v.x<40,JSON.stringify(v));assert.ok(v.z>5,`sliding retains tangential motion: ${JSON.stringify(v)}`);
  p.body.setTranslation({x:-1.36,y:.823,z:0},true);p.world.step();
  const away=sweptPlayerVelocity(p.controller,p.body,{x:-6.2,y:0,z:0},1/60,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  assert.ok(away.x < -6,'a contact does not pin the character');p.free();
});
test('a free exit endpoint does not permit a door route through wall or low overhead',()=>{
  for(const overhead of [false,true]){
    const p=passage(8),a={x:0,y:.88,z:0},b={x:1.4,y:.88,z:0};
    assert.equal(playerRouteClear(p.world,RAPIER,p.body,a,b),true);
    p.world.createCollider(RAPIER.ColliderDesc.cuboid(overhead?.2:.015,overhead?.1:1,1)
      .setTranslation(.7,overhead?1.65:1,0));p.world.step();
    assert.equal(playerRouteClear(p.world,RAPIER,p.body,a,b),false);p.free();
  }
});

test('a settled capsule can transfer to an open door without treating floor contact as a wall',()=>{
  const p=passage(8);
  for(let i=0;i<120;i++)p.world.step();
  const from=p.body.translation(),to={...from,x:from.x+1.4};
  assert.ok(Math.abs(from.y-.82)<.01);
  assert.equal(playerRouteClear(p.world,RAPIER,p.body,from,to),true);
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,1,1).setTranslation(from.x+.7,1,0));p.world.step();
  assert.equal(playerRouteClear(p.world,RAPIER,p.body,from,to),false);
  p.free();
});

test('boarding can separate from a car contact but cannot cross through the touching car',()=>{
  const p=passage(8),from={x:0,y:.88,z:0};
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(.015,1,1).setTranslation(.35,1,0));p.world.step();
  assert.equal(playerRouteClear(p.world,RAPIER,p.body,from,{...from,x:-.5}),true);
  assert.equal(playerRouteClear(p.world,RAPIER,p.body,from,{...from,x:1}),false);
  p.free();
});

test('diagonal input cannot cut an inside corner; sensors stay traversable',()=>{
  const p=passage(8);
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,2,4).setTranslation(-1,1,0));
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(4,2,.01).setTranslation(0,1,1));p.world.step();
  for(let i=0;i<120;i++)p.step({x:6.2,y:p.body.linvel().y,z:6.2});
  assert.ok(p.body.translation().x< -1.33,JSON.stringify(p.body.translation()));
  assert.ok(p.body.translation().z<.67,JSON.stringify(p.body.translation()));p.free();
  const s=passage(8);s.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,2,4).setTranslation(-1,1,0).setSensor(true));s.world.step();
  for(let i=0;i<50;i++)s.step({x:6.2,y:s.body.linvel().y,z:0});
  assert.ok(s.body.translation().x>3,'sensor does not block swept movement');s.free();
});
