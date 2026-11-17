import test from 'node:test';
import assert from 'node:assert/strict';
import { worldActorArrival, worldActorZone, worldActorSites } from './world-actor-sites.ts';
import { PLAYER_CENTER_HEIGHT, CAMERA_DEFAULT_YAW, CAMERA_DEFAULT_PITCH } from './actor-physics.ts';
import { CAMP_SPAWN, VEHICLES } from './layout.ts';
import { FACTORY, FACTORY_STATIONS, factoryWorld } from './factory/factory-layout.ts';
import { ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';
import { ALPHA_SAFE_GROUND, alphaWorld } from './alpha-island/alpha-layout.ts';
import { WORLD_PORTALS } from './world-portals.ts';
import { IBD_YARD, INTENT_COASTER } from './attractions/attraction-layout.ts';
const body=p=>[p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]];
const entry=(name,dev=false,qa=false,v4=true)=>worldActorArrival(`?start=${name}${qa?'&qa=1':''}`,dev,v4);

test('public arrivals preserve authored entrances, capsule offsets and attraction headings',()=>{
  for(const [name,p] of [['factory',FACTORY.entrance],['ibd',IBD_YARD.entrance],['coaster',INTENT_COASTER.entrance],
    ['town',[14,1.2,-2.5]],['tent',[-42,4.8,20]],
    ['brain',[ALPHA_MINE_ORIGIN[0],ALPHA_MINE_ORIGIN[1],ALPHA_MINE_ORIGIN[2]+.5]],
    ['exchange',[ALPHA_EXCHANGE_ORIGIN[0],ALPHA_EXCHANGE_ORIGIN[1],ALPHA_EXCHANGE_ORIGIN[2]+2.4]]]) {
    assert.deepEqual(entry(name).position,body(p),name);
    assert.equal(entry(name).ground,null);
  }
  for(const name of ['coaster','ibd']) {
    assert.equal(entry(name).yaw,Math.PI/2);assert.equal(entry(name).cameraYaw,Math.PI/2);
  }
  const unknown=entry('constructor');assert.deepEqual(unknown.position,CAMP_SPAWN);
  unknown.position[0]=999;assert.notEqual(entry('unknown').position[0],999);
  assert.equal(unknown.cameraYaw,CAMERA_DEFAULT_YAW);assert.equal(unknown.cameraPitch,CAMERA_DEFAULT_PITCH);
});

test('station and vehicle debug arrivals remain development-only; QA fixtures also require qa=1',()=>{
  for(const station of FACTORY_STATIONS) {
    assert.deepEqual(entry(`factory-${station.id}`,true).position,body(factoryWorld(station.at)));
    assert.deepEqual(entry(`factory-${station.id}`).position,CAMP_SPAWN);
    assert.deepEqual(entry(`factory-${station.id}`,true,false,false).position,CAMP_SPAWN);
  }
  for(const car of VEHICLES) {
    assert.deepEqual(entry(car.id,true).position,body([car.position[0],car.position[1],car.position[2]+2]));
    assert.deepEqual(entry(car.id).position,CAMP_SPAWN);
  }
  for(const name of ['brain-exit','brain-rail','wade','camp-bench','exchange-gallery']) {
    assert.deepEqual(entry(name,true).position,CAMP_SPAWN);
    assert.deepEqual(entry(name,false,true).position,CAMP_SPAWN);
    assert.notDeepEqual(entry(name,true,true).position,CAMP_SPAWN);
  }
});

test('portal arrival and camera face the authored entry; gallery and club camera overrides survive',()=>{
  for(const portal of WORLD_PORTALS) {
    const e=entry(`portal-${portal.id}`,true,true);
    assert.deepEqual(e.position,body(portal.entryApproachCandidates[0]));
    assert.equal(e.yaw,Math.PI/2+portal.yaw);assert.equal(e.cameraYaw,Math.PI/2-portal.yaw);
    assert.deepEqual(entry(`portal-${portal.id}`,true).position,CAMP_SPAWN);
  }
  const gallery=entry('exchange-gallery',true,true);
  assert.equal(gallery.cameraYaw,4.7113);assert.equal(gallery.cameraPitch,.4554);
  assert.equal(entry('club').yaw,-Math.PI/2);assert.equal(entry('club').cameraPitch,.4);
  assert.equal(entry('club-view',true,true).cameraYaw,0);
});

test('site queries preserve regional priority and order recovery candidates before generic roads',()=>{
  const island=entry('alpha-waterwheel');
  assert.deepEqual(island.ground,[206,24,206]);assert.deepEqual(island.position,body(island.ground));
  assert.equal(worldActorZone(island.position,'camp',false),'alpha');
  assert.equal(worldActorZone(FACTORY.entrance,'camp',false),'factory');
  assert.equal(worldActorZone([0,0,0],'camp',false),'camp');
  assert.equal(worldActorZone([0,0,0],undefined,false),'town');
  assert.equal(worldActorSites.rideZone(island.position,true),'alpha');
  assert.equal(worldActorSites.rideZone([0,1,0],true),'shore');
  assert.equal(worldActorSites.rideZone([0,1,0],false),'coaster');
  const p=island.position,candidates=worldActorSites.recoveryCandidates(p);
  const alpha=ALPHA_SAFE_GROUND.map(alphaWorld).sort((a,b)=>Math.hypot(a[0]-p[0],a[2]-p[2])-Math.hypot(b[0]-p[0],b[2]-p[2]));
  assert.deepEqual(candidates.slice(0,alpha.length),alpha);
  assert.deepEqual(candidates.at(-1),[CAMP_SPAWN[0],4.8,CAMP_SPAWN[2]]);
  const roads=worldActorSites.roadCandidates(p);assert.ok(roads.length>1);
  assert.ok(roads.every((r,i)=>!i||Math.hypot(r.position[0]-p[0],r.position[2]-p[2])>=Math.hypot(roads[i-1].position[0]-p[0],roads[i-1].position[2]-p[2])));
});
