import test from 'node:test';
import assert from 'node:assert/strict';
import { TIME_PRESETS, advanceWorldMinutes, timePresetAt, sampleTimeLight, formatWorldTime, TIME_LIGHT } from './world-climate.ts';
import { coverOrigin, fillWeatherCover, WEATHER_BUDGET, weatherSeeds, weatherSurfaceHeight } from './world-weather.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import { selectWorldTime, useWorldStore } from './store.ts';

test('one real second advances one island minute, including midnight',()=>{
  assert.equal(advanceWorldMinutes(1050,60,true),1110);
  assert.equal(advanceWorldMinutes(1439.5,1,true),.5);
  let minute=360;for(let i=0;i<600;i++)minute=advanceWorldMinutes(minute,.1,true);
  assert.ok(Math.abs(minute-420)<1e-7);
});
test('paused or hidden simulation makes no time catch-up',()=>{
  assert.equal(advanceWorldMinutes(360,600,false),360);
  assert.equal(advanceWorldMinutes(360,NaN,true),360);
  assert.equal(advanceWorldMinutes(360,-10,true),360);
});
test('six presets select their own period and preserve weather and running preference',()=>{
  useWorldStore.setState({weather:'snow',timeRunning:false});
  for(const p of TIME_PRESETS){
    selectWorldTime(p.id);const s=useWorldStore.getState();
    assert.equal(s.worldMinutes,p.minutes);assert.equal(timePresetAt(p.minutes),p.id);
    assert.equal(s.weather,'snow');assert.equal(s.timeRunning,false);
  }
});
test('light and clock remain continuous at midnight and across all day anchors',()=>{
  assert.equal(formatWorldTime(1440),'00:00');assert.equal(formatWorldTime(1050),'17:30');
  for(let m=0;m<1440;m+=.5){const s=sampleTimeLight(m);assert.ok(s.mix>=0&&s.mix<=1);assert.ok(s.night>=0&&s.night<=1);}
  const before=sampleTimeLight(1439.999),after=sampleTimeLight(.001);
  assert.equal(before.night,after.night);
  for(const p of TIME_PRESETS){const s=sampleTimeLight(p.minutes);assert.equal(s.night,TIME_LIGHT[p.id].night);}
});
test('weather shelter scans have a hard per-frame ray budget and cover their full area',()=>{
  const data=new Float32Array(WEATHER_BUDGET.coverSize**2),origin=coverOrigin(-81,-90);
  let index=0,total=0;
  while(index<data.length){let calls=0;index=fillWeatherCover(data,index,origin,(x,z)=>{calls++;return x+z;});assert.ok(calls<=32);total+=calls;}
  assert.equal(total,data.length);assert.equal(data[0],origin[0]+origin[1]);
  assert.equal(data.at(-1),origin[0]+origin[1]+128);
});
test('precipitation geometry is deterministic and fits the finite particle budget',()=>{
  const a=weatherSeeds(1200);assert.deepEqual(a,weatherSeeds(1200));
  assert.equal(a.length,3600);assert.ok(a.every(v=>v>=0&&v<1));
  assert.ok(WEATHER_BUDGET.balanced.rain<WEATHER_BUDGET.high.rain);
});
test('precipitation stops at a fixed roof and does not use an actor or sensor as shelter',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0});
  try{
    const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,20).setTranslation(0,-.1,0),fixed);
    world.createCollider(RAPIER.ColliderDesc.cuboid(2,.2,2).setTranslation(0,5,0),fixed);
    world.createCollider(RAPIER.ColliderDesc.cuboid(10,.2,10).setTranslation(0,20,0).setSensor(true),fixed);
    const actor=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,10,0));
    world.createCollider(RAPIER.ColliderDesc.ball(1),actor);world.step();
    const ray=new RAPIER.Ray({x:0,y:120,z:0},{x:0,y:-1,z:0});
    assert.ok(Math.abs(weatherSurfaceHeight(world,ray,0,0)-5.2)<1e-4);
    assert.ok(Math.abs(weatherSurfaceHeight(world,ray,8,8))<1e-4);
  }finally{world.free();}
});
