import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Quaternion, Euler, Box3, Vector3, Mesh, MeshBasicMaterial, Raycaster } from 'three';
import { buildFactoryGeometry, FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_STATIONS, FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET, FACTORY_DISPATCH_VIEWS, FACTORY_WORK_VIEWS } from './factory-layout.ts';
import { buildFactoryPrinter } from './factory-printer.ts';
import { playerSupport,followPlayerGround,compensatePlayerSlopeGravity,clearPlayerSlopeGravity } from '../player-ground.ts';
import { createPlayerClearance,sweptPlayerVelocity,playerVelocityChange } from '../player-motion.ts';
import { FACTORY_WALK_NODES,FACTORY_WALK_EDGES,factoryWalkingRoute } from './factory-navigation.ts';
import { createFactoryFollower,stepFactoryFollower } from './factory-follower.ts';
await R.init();
function worldFor(g){
  const w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
  const floor=w.createRigidBody(R.RigidBodyDesc.fixed());floor.userData={surface:true};
  w.createCollider(R.ColliderDesc.trimesh(g.surface.getAttribute('position').array,g.surface.index.array).setFriction(.8),floor);
  const fixed=w.createRigidBody(R.RigidBodyDesc.fixed());fixed.userData={solid:true};
  const printer=buildFactoryPrinter(FACTORY_PALETTE);
  const solids=[...g.solids,...printer.solids];printer.dispose();
  for(const s of solids){
    const c=R.ColliderDesc.cuboid(...s.size.map(v=>v/2)).setTranslation(...s.at);
    if(s.rotation){const q=new Quaternion().setFromEuler(new Euler(...s.rotation,'YXZ'));c.setRotation(q);}
    w.createCollider(c,fixed);
  }
  return w;
}
const dispose=g=>{g.geometry.dispose();g.roofs.dispose();g.surface.dispose();};
test('flat test lanes have one visible courtyard surface rather than coplanar overlays',()=>{
  const g=buildFactoryGeometry(),material=new MeshBasicMaterial(),mesh=new Mesh(g.surface,material);
  try{
    for(const offset of [0,FACTORY_LANE_OFFSET])for(const [x,z] of [[56.13,-4.27],[58.21,10.91],[61.87,4.23]]){
      const ray=new Raycaster(new Vector3(x+offset,4,z),new Vector3(0,-1,0));
      const hits=ray.intersectObject(mesh).filter(h=>Math.abs(h.point.y-.12)<1e-5);
      assert.equal(hits.length,1,`duplicate or missing flat surface at ${x+offset},${z}`);
    }
  }finally{material.dispose();dispose(g);}
});
test('factory three-level architecture stays finite and bounded; stations have physical standing space',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g);
  try{
    assert.ok(g.triangles>2000 && g.triangles<65000,g.triangles);
    for(const geo of [g.geometry,g.roofs,g.surface])for(const name of ['position','normal','color','aMat'])
      assert.ok(Array.from(geo.getAttribute(name).array).every(Number.isFinite),name);
    w.step();
    for(const s of FACTORY_STATIONS){
      const [x,y,z]=s.at,body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,y+.88,z).lockRotations());
      w.createCollider(R.ColliderDesc.capsule(.48,.34).setMass(72),body);
      for(let i=0;i<60;i++)w.step();
      const p=body.translation();assert.ok(Math.hypot(p.x-x,p.z-z)<.08,`station ${s.id} pushed ${JSON.stringify(p)}`);
      assert.ok(Math.abs(p.y-y-.82)<.03,`station ${s.id} height ${p.y}`);w.removeRigidBody(body);
    }
  }finally{w.free();dispose(g);}
});
test('production capsule walks from entrance to both galleries and returns without jumping',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g);
  const body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(43,1,-23).lockRotations().setLinearDamping(.2).setCcdEnabled(true));
  w.createCollider(R.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min),body);
  const guard=createPlayerClearance(w);w.step();
  function tick(vx,vz){
    const s=playerSupport(w,R,body),v=body.linvel(),change=playerVelocityChange(v,{x:vx,y:0,z:vz},1/60,!!s?.grounded);
    compensatePlayerSlopeGravity(w,body,s,1/60,false);body.applyImpulse({x:change.x*72,y:0,z:change.z*72},true);
    body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);
    followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();clearPlayerSlopeGravity(body);
  }
  try{
    for(let i=0;i<30;i++)tick(0,0);
    for(const target of [[43,3,4.32],[43,34,4.32],[13,34,8.52],[43,34,4.32],[43,3,4.32],[43,-23,.12]]){
      let arrived=false;
      for(let i=0;i<1500;i++){
        const p=body.translation(),dx=target[0]-p.x,dz=target[1]-p.z,d=Math.hypot(dx,dz);
        if(d<.08){arrived=true;break;}
        const speed=Math.min(3.6,d*5);tick(dx/d*speed,dz/d*speed);
      }
      assert.ok(arrived,`route ${target} blocked at ${JSON.stringify(body.translation())}`);
      for(let i=0;i<35;i++)tick(0,0);
      assert.ok(playerSupport(w,R,body)?.grounded);
      assert.ok(Math.abs(body.translation().y-target[2]-.82)<.06,`landing ${target} at ${JSON.stringify(body.translation())}`);
    }
  }finally{w.removeCharacterController(guard);w.free();dispose(g);}
});
test('two test lanes derive from identical translated surface sections',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g);
  try{
    w.step();
    for(const p of FACTORY_COURSE_LOCAL){
      const heights=[0,FACTORY_LANE_OFFSET].map(dx=>{
        const ray=new R.Ray({x:p[0]+dx,y:5,z:p[2]},{x:0,y:-1,z:0});
        const hit=w.castRay(ray,10,true);assert.ok(hit);return 5-hit.timeOfImpact;
      });
      assert.ok(Math.abs(heights[0]-heights[1])<1e-5,`lanes differ at ${p}: ${heights}`);
    }
  }finally{w.free();dispose(g);}
});
test('finished modules can leave all three press beds through a real opening',()=>{
  const g=buildFactoryGeometry();
  try{
    for(const z of [-11,2,15]){
      // The workpiece travels out along +X. Old full-depth columns blocked it
      // despite the visual conveyor continuing on the far side of the wall.
      const outfeed=new Box3(new Vector3(-24.9,1.4,z-.6),new Vector3(-22,2.2,z+.6));
      for(const solid of g.solids){
        if(solid.rotation)continue;
        const bounds=new Box3().setFromCenterAndSize(new Vector3(...solid.at),new Vector3(...solid.size));
        assert.ok(!bounds.intersectsBox(outfeed),`press ${z} blocked by ${solid.at}`);
      }
    }
  }finally{dispose(g);}
});
test('every signed ground-floor walking edge clears the full standing capsule in both directions',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g),shape=new R.Capsule(.48,.34),q={x:0,y:0,z:0,w:1};
  try{
    w.step();
    for(const [a,b] of FACTORY_WALK_EDGES)for(const [start,end] of [[a,b],[b,a]]){
      const p=FACTORY_WALK_NODES[start],t=FACTORY_WALK_NODES[end];
      const hit=w.castShape({x:p[0],y:p[1]+.84,z:p[2]},q,{x:t[0]-p[0],y:0,z:t[2]-p[2]},shape,0,1,true);
      assert.ok(!hit,`${start} → ${end}: blocked at ${hit?.time_of_impact}, collider ${JSON.stringify(hit?.collider.translation())}`);
    }
    for(const a of FACTORY_STATIONS)for(const b of FACTORY_STATIONS){
      if(a.id===b.id)continue;
      const path=factoryWalkingRoute(a.id,b.id);
      assert.deepEqual(path[0],a.at);assert.deepEqual(path.at(-1),b.at);
    }
  }finally{w.free();dispose(g);}
});
test('released companion clears the real dispatch ramp and display lane, including overhead galleries',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g),state=createFactoryFollower(),shape=new R.Ball(.5),q={x:0,y:0,z:0,w:1};
  try{
    w.step();
    const input={released:true,playerFootpoint:null,movementClear(from,to){
      return !w.castShape({x:from[0],y:from[1]+.65,z:from[2]},q,
        {x:to[0]-from[0],y:to[1]-from[1],z:to[2]-from[2]},shape,.005,1,true);
    }};
    for(let i=0;i<1200;i++)stepFactoryFollower(state,input,1/60);
    assert.equal(state.phase,'parked',JSON.stringify(state.position));
    for(const target of [[44,.12,29],[33,.12,29],[45,.12,28.2]]){
      input.playerFootpoint=target;
      for(let i=0;i<1200;i++)stepFactoryFollower(state,input,1/60);
      assert.ok(Math.hypot(state.position[0]-target[0],state.position[2]-target[2])<1.55,JSON.stringify(state.position));
    }
  }finally{w.free();dispose(g);}
});
test('dispatch camera has a full clearance sweep below the gallery and outside the printer',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g);
  try{
    w.step();for(const {eye,target} of Object.values(FACTORY_DISPATCH_VIEWS)){
    const hit=w.castShape({x:target[0],y:target[1],z:target[2]},{x:0,y:0,z:0,w:1},
      {x:eye[0]-target[0],y:eye[1]-target[1],z:eye[2]-target[2]},new R.Ball(.18),0,1,true);
    assert.equal(hit,null,`dispatch camera stopped ${hit?.time_of_impact}`);
    }
  }finally{w.free();dispose(g);}
});
test('operator views reach the real work area without the collision camera collapsing into equipment',()=>{
  const g=buildFactoryGeometry(),w=worldFor(g);
  try{
    w.step();for(const [station,{eye,target}] of Object.entries(FACTORY_WORK_VIEWS)){
      const hit=w.castShape({x:target[0],y:target[1],z:target[2]},{x:0,y:0,z:0,w:1},
        {x:eye[0]-target[0],y:eye[1]-target[1],z:eye[2]-target[2]},new R.Ball(.18),0,1,true);
      assert.ok(!hit,`${station} view blocked at ${hit?.time_of_impact}, collider ${JSON.stringify(hit?.collider.translation())}`);
    }
  }finally{w.free();dispose(g);}
});
