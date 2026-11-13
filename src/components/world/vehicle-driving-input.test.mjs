import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrivingState, stepCoupeDrive } from './vehicle-driving.ts';

function sample(speed,input,dt=1/60,driven=true,power=.8) {
  const state=createDrivingState();state.power=power;
  const wheels=Array.from({length:4},()=>({}));
  const tyres={wheelIsInContact:()=>true,wheelSuspensionLength:()=>.42};
  for(const [method,key] of Object.entries({setWheelSteering:'steer',setWheelEngineForce:'engine',setWheelBrake:'brake',setWheelFrictionSlip:'grip',setWheelSideFrictionStiffness:'sideGrip'}))tyres[method]=(i,v)=>{wheels[i][key]=v;};
  const body={rotation:()=>({x:0,y:0,z:0,w:1}),linvel:()=>({x:speed,y:0,z:0}),angvel:()=>({x:0,y:0,z:0}),principalInertia:()=>({x:1,y:1,z:1}),applyTorqueImpulse:()=>{}};
  stepCoupeDrive(body,tyres,state,input,1000,2.8,dt,driven);
  return {state,wheels};
}

test('service brake cuts residual drive immediately in either direction without handbrake grip loss',()=>{
  for(const speed of [0,.1,-.1,8,-8,29,35]){
    const {state,wheels}=sample(speed,{throttle:1,steer:0,brake:true});
    assert.equal(state.power,0);assert.equal(state.handbrake,false);assert.equal(state.rearGrip,1);
    assert.ok(wheels.every(w=>w.engine===0&&w.brake>0&&w.sideGrip===1));
    assert.ok(wheels[0].brake>wheels[2].brake,'front-biased service braking');
  }
});

test('service brake impulse budget is independent of the physics step rate',()=>{
  for(const hz of [30,60,120]){
    const dt=1/hz,{wheels}=sample(30,{throttle:0,steer:0,brake:true},dt);
    assert.ok(Math.abs(wheels.reduce((sum,w)=>sum+w.brake,0)/1000/dt-15.6)<1e-10);
  }
});

test('opposite throttle brakes before reversing; low-speed reverse and parked holding remain available',()=>{
  const moving=sample(20,{throttle:-1,steer:0});assert.equal(moving.state.braking,true);
  const stopped=sample(0,{throttle:-1,steer:0},1/60,true,0);
  assert.equal(stopped.state.braking,false);assert.ok(stopped.wheels.every(w=>w.brake===0&&w.engine<0));
  const parked=sample(0,{throttle:1,steer:0},1/60,false);
  assert.ok(parked.wheels.every(w=>w.engine===0&&w.brake===35));
});
