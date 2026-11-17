import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import R from '@dimforge/rapier3d-compat';
import { worldActorSites } from './world-actor-sites.ts';
import { CAMP_SPAWN, VEHICLES, WATER_Y } from './layout.ts';
import { WORLD_PORTALS, portalCrossing as worldCrossing } from './world-portals.ts';
import { portalCrossing } from './portal-crossing.ts';
import { recoverActor } from './world-recovery.ts';
import { useWorldStore } from './store.ts';
import { actorActivities } from './actor-activities.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

await R.init();

test('world assembly supplies unchanged home, water, vehicle specs and every portal opening and landing',()=>{
  assert.deepEqual(worldActorSites.home.position,CAMP_SPAWN);
  assert.equal(worldActorSites.home.zone,'camp');assert.equal(worldActorSites.waterY,WATER_Y);
  assert.deepEqual(worldActorSites.vehicles,VEHICLES);
  assert.equal(worldActorSites.portals.length,WORLD_PORTALS.length);
  for(const original of WORLD_PORTALS) {
    const injected=worldActorSites.portals.find(p=>p.id===original.id);assert.ok(injected);
    for(const key of ['position','yaw','innerRadius','centerHeight','arrivalCandidates'])
      assert.deepEqual(injected[key],original[key],`${original.id}/${key}`);
    assert.equal(injected.fallbackZone,original.id==='camp'?'camp':'park');
    assert.ok(injected.notice.en.startsWith('Arrived at '));assert.ok(injected.notice.zh.startsWith('已抵达'));
  }
  assert.equal(worldCrossing,portalCrossing,'world compatibility export and core share one calculation');
});

test('an injected portal with a new identity and arbitrary rotation uses the same swept capsule clearance',()=>{
  const portal={id:'test-gate',position:[-123,7,93],yaw:.37,innerRadius:1.25,centerHeight:1.65,
    arrivalCandidates:[],fallbackZone:'shore',notice:{en:'test',zh:'测试'}};
  const point=(x,y,z)=>[portal.position[0]+Math.cos(portal.yaw)*x+Math.sin(portal.yaw)*z,
    portal.position[1]+y,portal.position[2]-Math.sin(portal.yaw)*x+Math.cos(portal.yaw)*z];
  assert.equal(portalCrossing(portal,point(0,1.37,1),point(0,1.37,-1)),true);
  assert.equal(portalCrossing(portal,point(0,1.37,-1),point(0,1.37,1)),true);
  assert.equal(portalCrossing(portal,point(1.1,1.37,1),point(1.1,1.37,-1)),false);
  assert.equal(portalCrossing(portal,point(0,3,1),point(0,3,-1)),false);
  assert.equal(portalCrossing(portal,point(0,1.37,1),point(0,1.37,.01)),false);
});

test('generic recovery uses the supplied home and notice and clears real rigid-body motion',()=>{
  const previous=useWorldStore.getState(),world=new R.World({x:0,y:0,z:0});
  const home={position:[123,18,77],zone:'shore',notice:{zh:'测试安全点',en:'Fixture refuge'}};
  const original=structuredClone(home),events=[];
  const player=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-10,-40,20).lockRotations());
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),player);
  player.setEnabled(false);player.setLinvel({x:4,y:-3,z:2},true);player.addForce({x:80,y:3,z:9},true);
  const car=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(10,3,2));
  world.createCollider(R.ColliderDesc.cuboid(2,.5,1),car);car.setLinvel({x:8,y:0,z:3},true);
  const carPosition={...car.translation()};
  const release=actorActivities.register({id:'recovery-observer',read:()=>({busy:false,carrying:false}),
    input(){},advance(){},command:()=>false,dispose(){},interrupt:r=>events.push(r),
    sync:p=>events.push(structuredClone(p))});
  try {
    useWorldStore.setState({paused:true,activeVehicle:'coupe',card:{id:'qa',kind:'note'}});
    assert.equal(recoverActor(home,player,car,()=>events.push('clear'),()=>events.push('camera')),true);
    assert.deepEqual(Object.values(player.translation()),home.position);
    assert.deepEqual({...car.translation()},carPosition);assert.deepEqual(Object.values(car.linvel()),[0,0,0]);
    assert.deepEqual(events,['recovery','clear',{position:home.position,grounded:false,available:false},'camera']);
    assert.equal(player.isEnabled(),true);assert.equal(useWorldStore.getState().paused,false);
    assert.equal(useWorldStore.getState().zone,'shore');assert.deepEqual(useWorldStore.getState().position,home.position);
    assert.equal(useWorldStore.getState().toast.en,home.notice.en);assert.equal(useWorldStore.getState().card,null);
    for(let i=0;i<10;i++)world.step();
    assert.deepEqual(Object.values(player.translation()),home.position);assert.deepEqual(home,original);
    events.length=0;assert.equal(recoverActor(home,null,car,()=>events.push('bad'),()=>events.push('bad')),false);
    assert.deepEqual(events,[]);
  } finally {release();world.free();useWorldStore.setState(previous);}
});

test('the complete actor runtime bundle retains physics and visuals without importing any venue or map implementation',async()=>{
  const result=await build({entryPoints:[new URL('./WorldActors.tsx',import.meta.url).pathname],
    bundle:true,write:false,format:'esm',packages:'external',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  for(const required of ['player-ground.ts','safe-landing.ts','region-passage.ts','world-arrival-readiness.ts',
    'WorldGuide.tsx','WorldVehicleVisual.tsx','portal-crossing.ts','world-recovery.ts'])
    assert.ok(inputs.some(p=>p.endsWith('/'+required)),`real ${required} is bundled`);
  assert.deepEqual(inputs.filter(p=>/(?:\/attractions\/|\/alpha-island\/|\/factory\/|\/alpha-(?:mine|exchange)|\/camp-prop-|\/club-actor-|djc-club|WorldLandform|\/layout(?:-v4(?:-flag)?)?\.ts|\/world-actor-sites|\/world-portals|\/world-guide-(?:assets|presentation))/.test(p)),[]);
});
