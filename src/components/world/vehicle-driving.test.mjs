import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { configureRaycastVehicle, wheelGeometry, heading, rampAxis, rotateVector } from './actor-physics.ts';
import { configureCoupeSuspension, createDrivingState, stepCoupeDrive } from './vehicle-driving.ts';
import { VEHICLES } from './layout.ts';
const require=createRequire(import.meta.url);
const {default:R}=await import(require.resolve('@dimforge/rapier3d-compat',{paths:[require.resolve('@react-three/rapier')]}));
await R.init();
const spec=VEHICLES.find(v=>v.id==='coupe'), hull=JSON.parse(readFileSync(new URL('./WorldVehicleHulls.json',import.meta.url))).G26;
const dt=1/60;
// Same mass carriers, COM, hulls, damping and ray filtering as the normal live coupe.
function fixture({legacy=false,bump=false,support=null}={}) {
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=dt;
  world.createCollider(R.ColliderDesc.cuboid(1000,.5,1000).setTranslation(0,-.5,0).setFriction(1));
  if(bump)world.createCollider(R.ColliderDesc.cuboid(.6,.06,10).setTranslation(12,.06,0));
  if(support){
    const desc=support==='dynamic'?R.RigidBodyDesc.dynamic():support==='kinematic'?R.RigidBodyDesc.kinematicPositionBased():R.RigidBodyDesc.fixed();
    const prop=world.createRigidBody(desc.setTranslation(0,.08,0));
    world.createCollider(R.ColliderDesc.cuboid(4,.08,4).setSensor(support==='sensor'),prop);
  }
  const geometry=wheelGeometry(spec.size),body=world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(0,geometry.height,0).setLinearDamping(legacy?.12:.025).setAngularDamping(.65).setCcdEnabled(true));
  function massBox(mass,x,y,z,offset=0){
    world.createCollider(R.ColliderDesc.cuboid(x/2,y/2,z/2).setTranslation(offset,spec.size[1]*(offset?.42:0),0)
      .setSensor(true).setCollisionGroups(0).setMassProperties(mass,{x:0,y:-.2,z:0},
        {x:mass*(y*y+z*z)/12,y:mass*(x*x+z*z)/12,z:mass*(x*x+y*y)/12},{x:0,y:0,z:0,w:1}),body);
  }
  const [l,h,w]=spec.size;massBox(spec.mass*.78,l,h*.58,w);massBox(spec.mass*.22,l*.5,h*.4,w*.86,-l*.08);
  for(const part of hull.hulls)world.createCollider(R.ColliderDesc.convexHull(new Float32Array(part.points))
    .setTranslation(0,hull.bodyY,0).setMass(0).setFriction(.1).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(.1),body);
  const tyres=world.createVehicleController(body),state=createDrivingState();
  configureRaycastVehicle(tyres,spec.size,spec.mass,spec.grip,spec.suspension/spec.mass);
  if(!legacy)configureCoupeSuspension(tyres);
  let throttle=0,steer=0,frames=0;
  const rows=[];
  function step(seconds,input={throttle:0,steer:0}){
    for(let n=0;n<Math.round(seconds/dt);n++){
      throttle=rampAxis(throttle,input.throttle??0,dt,3,6);steer=rampAxis(steer,input.steer??0,dt,2.8,5);
      if(legacy){
        const speed=tyres.currentVehicleSpeed(),braking=input.brake||throttle*speed<-.8;
        for(let i=0;i<4;i++){
          tyres.setWheelSteering(i,i<2?steer*.52/(1+Math.abs(speed)*.045):0);
          tyres.setWheelEngineForce(i,!braking&&Math.abs(speed)<(throttle<0?9:29)?throttle*spec.engineForce/4:0);
          tyres.setWheelBrake(i,braking?spec.mass*.028:Math.abs(throttle)<.02?spec.mass*.0015:0);
          tyres.setWheelFrictionSlip(i,spec.grip*(i>=2&&Math.abs(steer)>.45&&Math.abs(speed)>7?.68:1));
        }
      }else stepCoupeDrive(body,tyres,state,{...input,throttle,steer},spec.mass,l*.68,dt);
      tyres.updateVehicle(dt,R.QueryFilterFlags.EXCLUDE_SENSORS|R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC,undefined,c=>c.parent()?.handle!==body.handle);
      world.step();frames++;
      const v=body.linvel(),q=body.rotation(),p=body.translation();
      const front=rotateVector([1,0,0],q),side=rotateVector([0,0,1],q);
      const forward=v.x*front[0]+v.y*front[1]+v.z*front[2],lateral=v.x*side[0]+v.y*side[1]+v.z*side[2];
      rows.push({t:frames*dt,p:[p.x,p.y,p.z],speed:Math.hypot(v.x,v.z),vy:v.y,yaw:heading(q),up:1-2*(q.x*q.x+q.z*q.z),
        slip:Math.atan2(lateral,Math.max(Math.abs(forward),2)),contacts:[0,1,2,3].filter(i=>tyres.wheelIsInContact(i)).length,nitro:state.nitro,boost:state.boosting});
    }
    return rows.at(-1);
  }
  step(2);rows.length=0;
  return {body,world,tyres,state,rows,step,free:()=>{world.removeVehicleController(tyres);world.free();}};
}

test('coupe: progressive acceleration, effective foot brake, deliberate reverse',()=>{
  const f=fixture();try{
    f.step(4,{throttle:1,steer:0});const forward=f.rows.at(-1);assert.ok(forward.speed>14&&forward.speed<27);
    const x=forward.p[0];f.step(3,{throttle:0,steer:0,brake:true});
    assert.ok(f.rows.at(-1).speed<.25,JSON.stringify({forward,end:f.rows.at(-1),mass:f.body.mass()}));assert.ok(f.rows.at(-1).p[0]-x<32);
    f.step(2,{throttle:-1,steer:0});assert.ok(f.body.linvel().x< -2,'reverse engages after stopping');
  }finally{f.free();}
});

test('coupe: comparable baseline and candidate measurements at 60 km/h',()=>{
  const result=[];
  for(const legacy of [true,false]){
    const f=fixture({legacy});try{
      let seconds=0;while(f.rows.at(-1)?.speed<60/3.6||!f.rows.length){f.step(dt,{throttle:1,steer:0});seconds+=dt;if(seconds>12)break;}
      assert.ok(seconds<8,'reaches 60 km/h in a useful interval');
      const x=f.rows.at(-1).p[0];let brakeSeconds=0;
      while(f.rows.at(-1).speed>.2&&brakeSeconds<8){f.step(dt,{throttle:0,steer:0,brake:true});brakeSeconds+=dt;}
      assert.ok(brakeSeconds<5,JSON.stringify({legacy,seconds,brakeSeconds,end:f.rows.at(-1),mass:f.body.mass()}));
      result.push({handling:legacy?'baseline':'candidate',zeroTo60:+seconds.toFixed(3),brakeSeconds:+brakeSeconds.toFixed(3),brakeMetres:+(f.rows.at(-1).p[0]-x).toFixed(3)});
    }finally{f.free();}
  }
  console.log('coupe measurements '+JSON.stringify(result));
});

test('coupe: boost is finite, improves acceleration, cannot auto-cycle while held',()=>{
  const normal=fixture(),boost=fixture();try{
    normal.step(4,{throttle:1,steer:0});boost.step(4,{throttle:1,steer:0,boost:true});
    assert.ok(boost.rows.at(-1).speed>normal.rows.at(-1).speed+3);
    assert.equal(boost.state.nitro,0);assert.equal(boost.state.boosting,false);
    boost.step(4,{throttle:1,steer:0,boost:true});assert.equal(boost.state.nitro,0);
    boost.step(3,{throttle:0,steer:0});assert.ok(boost.state.nitro>.25&&boost.state.nitro<.4);
  }finally{normal.free();boost.free();}
});

test('coupe: handbrake initiates a slide, release recovers grip without overturning',()=>{
  const normal=fixture(),drift=fixture();try{
    for(const f of [normal,drift])f.step(2.5,{throttle:1,steer:0});
    normal.step(.65,{throttle:1,steer:.7});drift.step(.65,{throttle:1,steer:.7,handbrake:true});
    const maxSlip=f=>Math.max(...f.rows.slice(-39).map(r=>Math.abs(r.slip)));
    assert.ok(maxSlip(drift)>maxSlip(normal)+.06,'handbrake creates more slip than normal cornering');
    drift.step(2,{throttle:.7,steer:0});assert.ok(Math.abs(drift.state.slipAngle)<.18,'slide can settle after release');
    assert.ok(drift.rows.every(r=>r.up>.5),'car stays upright');
  }finally{normal.free();drift.free();}
});

test('coupe: steering at speed and a 12 cm road seam remain physically supported',()=>{
  for(const bump of [false,true]){
    const f=fixture({bump});try{
      f.step(2.7,{throttle:1,steer:0});f.step(3,{throttle:.6,steer:bump?0:1});f.step(3,{throttle:0,steer:0,brake:true});
      assert.ok(f.rows.every(r=>r.up>.5));assert.ok(f.rows.at(-1).contacts===4);
      assert.ok(f.rows.at(-1).speed<.3);
      const settled=f.rows.slice(-60).map(r=>r.p[1]);
      assert.ok(Math.max(...settled)-Math.min(...settled)<.01,'settled chassis has under 1 cm vertical motion');
    }finally{f.free();}
  }
});

test('coupe: an airborne car retains momentum without spending nitro',()=>{
  const f=fixture();try{
    f.body.setTranslation({x:0,y:8,z:0},true);f.body.setLinvel({x:12,y:0,z:0},true);
    f.step(.1);const before=f.body.linvel().x;
    f.step(1,{throttle:1,steer:1,boost:true});
    assert.equal(f.state.nitro,1);assert.equal(f.state.boosting,false);assert.equal(f.state.contacts,0);
    assert.ok(f.body.linvel().x>10&&f.body.linvel().x<=before+.1);
    assert.ok(Math.abs(f.body.angvel().y)<.01,'no artificial yaw in the air');
  }finally{f.free();}
});

test('L1 ray flags keep fixed support but reject sensors, cars and movable/kinematic props',()=>{
  for(const support of ['fixed','dynamic','kinematic','sensor']){
    const f=fixture({support});try{
      const y=[0,1,2,3].map(i=>f.tyres.wheelContactPoint(i)?.y);
      assert.ok(y.every(v=>Math.abs(v-(support==='fixed'?.16:0))<.01),JSON.stringify({support,y}));
    }finally{f.free();}
  }
});
