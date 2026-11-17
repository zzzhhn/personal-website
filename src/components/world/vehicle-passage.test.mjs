import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import hulls from './WorldVehicleHulls.json' with {type:'json'};
import { VEHICLES } from './layout.ts';
import { configureRaycastVehicle, wheelGeometry } from './actor-physics.ts';
import { vehiclePassageRadius } from './vehicle-passage.ts';
import { createRegionPassage, passageVelocity, passageRoute, polygonPassageFootprint } from './region-passage.ts';
import { worldPassageRegions } from './world-actor-sites.ts';
import { ALPHA_MINE_FOOTPRINT_POINTS } from './alpha-mine-layout.ts';
import { FACTORY_FOOTPRINT } from './factory/factory-layout.ts';
import { IBD_FOOTPRINT } from './attractions/attraction-layout.ts';
import { TransportDriver } from './rides/transport-driver.ts';
await R.init();

test('vehicle envelope includes every exported hull vertex and conservatively covers wheel suspension',()=>{
  for(const spec of VEHICLES) {
    const fallback=vehiclePassageRadius(spec.size),w=wheelGeometry(spec.size);
    for(const p of w.points)assert.ok(fallback>Math.hypot(p[0],p[1]-w.rest-.32,p[2])+w.radius);
    for(const hull of Object.values(hulls)) {
      if(!hull.hulls)continue;
      const radius=vehiclePassageRadius(spec.size,hull);
      for(const part of hull.hulls)for(let i=0;i<part.points.length;i+=3)
        assert.ok(radius>Math.hypot(part.points[i],part.points[i+1]+hull.bodyY,part.points[i+2]));
    }
  }
});

test('polygon loading boundaries expand for large vehicles beyond terrain helper broad phases',()=>{
  const regions=worldPassageRegions(true);
  for(const [id,points] of [['brain',ALPHA_MINE_FOOTPRINT_POINTS],['factory',FACTORY_FOOTPRINT],['ibd',IBD_FOOTPRINT]]) {
    const west=points.reduce((a,b)=>a[0]<b[0]?a:b),region=regions.find(r=>r.id===id);
    assert.equal(region.contains([west[0]-7,0,west[1]],8),true,id);
    assert.equal(region.contains([west[0]-9,0,west[1]],8),false,id);
  }
  const concave=polygonPassageFootprint([[0,0],[8,0],[8,2],[2,2],[2,8],[0,8]]);
  assert.equal(concave([6,0,6],0),false,'an AABB is not the concave footprint');
  assert.equal(concave([1,0,6],0),true);
  assert.equal(concave([3,0,6],1),true);
});

test('boarding checks every leg and stationary endpoint, not just free start/end positions',()=>{
  let ready=false;
  const gate=createRegionPassage([{id:'station',requirements:[{name:'station'}],contains:polygonPassageFootprint([[0,-1],[2,-1],[2,1],[0,1]])}],r=>!r.length||ready);
  assert.equal(passageRoute(gate,[],.34),false);
  assert.equal(passageRoute(gate,[[1,0,0]],.34),false);
  assert.equal(passageRoute(gate,[[-2,0,0],[4,0,0]],.34),false);
  assert.equal(passageRoute(gate,[[-2,0,0],[-2,0,3],[4,0,3],[4,0,0]],.34),true);
  ready=true;assert.equal(passageRoute(gate,[[-2,0,0],[4,0,0]],.34),true);
  ready=false;assert.equal(passageRoute(gate,[[-2,0,0],[4,0,0]],.34),false,'recheck after an animation');
});

test('real raycast vehicle stops its entire envelope after engine impulses and resumes on readiness',()=>{
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/60;
  const spec=VEHICLES.find(v=>v.id==='van'),w=wheelGeometry(spec.size),radius=vehiclePassageRadius(spec.size);
  let ready=false;
  const gate=createRegionPassage([{id:'cold',requirements:[{name:'cold'}],contains:p=>p[0]>=0}],needs=>!needs.length||ready);
  // A half-plane with the same radius expansion as production footprints.
  const envelopeGate=createRegionPassage([{id:'cold',requirements:[{name:'cold'}],contains:(p,r)=>p[0]>=-r}],needs=>!needs.length||ready);
  try {
    world.createCollider(R.ColliderDesc.cuboid(100,.5,100).setTranslation(0,-.5,0));
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-radius-4,w.height,0).lockRotations());
    world.createCollider(R.ColliderDesc.cuboid(spec.size[0]/2,spec.size[1]*.29,spec.size[2]/2).setMass(spec.mass),body);
    const wheels=world.createVehicleController(body);configureRaycastVehicle(wheels,spec.size,spec.mass,spec.grip,spec.suspension/spec.mass);
    world.step();body.setLinvel({x:22,y:0,z:0},true);
    let blocked=0;
    const step=()=>{
      for(let i=0;i<4;i++)wheels.setWheelEngineForce(i,spec.engineForce/4);
      wheels.updateVehicle(1/60,R.QueryFilterFlags.EXCLUDE_SENSORS);
      const p=body.translation(),before=body.linvel(),motion=passageVelocity(envelopeGate,[p.x,p.y,p.z],before,1/60,radius);
      if(motion.blocked){blocked++;assert.equal(motion.velocity.y,before.y);body.setLinvel(motion.velocity,true);}
      world.step();
    };
    for(let i=0;i<180;i++)step();
    assert.ok(blocked>0);assert.ok(body.translation().x+radius<0,'nose cannot reach the unloaded district');
    assert.ok(gate.at([body.translation().x,1,0]),'center-only gate would falsely allow this approach');
    const held=body.translation().x;ready=true;
    for(let i=0;i<180;i++)step();
    assert.ok(body.translation().x>held+1,'same driver input resumes without relocation');
    world.removeVehicleController(wheels);
  } finally {world.free();}
});

test('transport walk-out waits for a late district and resumes the same path after readiness',()=>{
  const terminal=x=>({id:String(x),vehicle:[x,0,0],yaw:0,boarding:[[x,0,3],[x,0,0]],egress:[[x,0,0],[x,0,3]],safeExit:[x,0,3],seat:[0,.48,0],clearance:[3,3,4]});
  const route={id:'late-destination',kind:'ferry',transform:{origin:[0,0,0],yaw:0},path:[[0,0,0],[20,0,0]],duration:1,terminals:[terminal(0),terminal(20)]};
  let ready=false;
  const gate=createRegionPassage([{id:'arrival',requirements:[{name:'arrival'}],contains:(p,r)=>p[0]>10&&p[2]>=1-r}],needs=>!needs.length||ready);
  const d=new TransportDriver(route,0);d.capture([0,0,3],0);
  d.setMovementGuard((a,b)=>passageRoute(gate,[a,b],.34));
  for(let i=0;i<3000;i++)d.step(1/60,false);
  assert.equal(d.phase,'walk-out');assert.equal(d.blockedMotion,true);assert.ok(d.frame.root[2]<1);
  const held=[...d.frame.root];for(let i=0;i<60;i++)d.step(1/60,false);assert.deepEqual(d.frame.root,held);
  ready=true;for(let i=0;i<3000&&d.phase!=='complete';i++)d.step(1/60,false);
  assert.equal(d.phase,'complete');assert.deepEqual(d.frame.root,[20,0,3]);d.dispose('complete');
});
