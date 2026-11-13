import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_VEHICLE_TRANSITION_S, guideVehicleApproachSeconds, guideVehicleProgress, guideVehicleSample } from './WorldGuideVehicle.ts';

test('near-door entry has no fixed walk-in wait; route length still controls travel time',()=>{
  assert.equal(guideVehicleApproachSeconds(0),.08);
  assert.equal(guideVehicleApproachSeconds(2.4),1);
  for(const distance of [0,.1,1,3,8]){
    const approach=guideVehicleApproachSeconds(distance),duration=approach+.7*GUIDE_VEHICLE_TRANSITION_S;
    assert.equal(guideVehicleProgress('enter',approach,approach),.3);
    assert.equal(guideVehicleSample('enter',guideVehicleProgress('enter',approach,approach)).doorOpen,0);
    assert.ok(Math.abs(guideVehicleProgress('enter',duration,approach)-1)<1e-12);
    if(distance===0)assert.ok(duration<2.1);
  }
});

test('accelerated wall clock retains open-door, leading-step, body-transfer and seat order',()=>{
  for(const phase of ['enter','exit']){
    const approach=guideVehicleApproachSeconds(0),duration=phase==='enter'?approach+.7*GUIDE_VEHICLE_TRANSITION_S:.7*GUIDE_VEHICLE_TRANSITION_S;
    assert.ok(duration<2.1);
    for(let frame=0;frame<=Math.ceil(duration*120);frame++){
      const elapsed=Math.min(duration,frame/120),sample=guideVehicleSample(phase,guideVehicleProgress(phase,elapsed,approach));
      if(sample.transfer>0&&sample.transfer<1)assert.equal(sample.doorOpen,1,'body crosses only a fully open door');
      if(sample.transfer>0)assert.equal(sample.leadStep,1,'leading foot establishes contact first');
      if(sample.sit>0)assert.equal(sample.transfer,1,'seat contact follows body transfer');
    }
    const end=guideVehicleSample(phase,guideVehicleProgress(phase,duration,approach));
    assert.equal(end.doorOpen,0);assert.equal(end.sit,phase==='enter'?1:0);
    assert.equal(end.transfer,phase==='enter'?1:0);
  }
});
