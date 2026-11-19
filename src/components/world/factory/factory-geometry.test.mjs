import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Quaternion, Euler, Box3, Vector3, Mesh, MeshBasicMaterial, Raycaster } from 'three';
import { buildFactoryGeometry, FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_STATIONS, FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET, FACTORY_DISPATCH_VIEWS, FACTORY_WORK_VIEWS, factoryWorld } from './factory-layout.ts';
import { buildFactoryWorklife } from './factory-worklife.ts';
import { canOpenFactoryStation, openFactoryStation, closeFactoryStation, useFactoryStore } from './factory-store.ts';
import { registerFactoryActivity } from './factory-actor-activity.ts';
import { createActorActivities } from '../actor-activities.ts';
import { useWorldStore } from '../store.ts';
import { pickupGroundRoute } from '../pickup-approach.ts';
import { interactionVisible } from '../interaction-offer.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../actor-physics.ts';
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
  w.createCollider(R.ColliderDesc.trimesh(g.roofs.attributes.position.array,g.roofs.index.array),fixed);
  for(const contact of [...g.rails, ...g.structureContacts])w.createCollider(R.ColliderDesc.trimesh(contact.vertices,contact.indices).setFriction(.85),fixed);
  const worklife=buildFactoryWorklife(FACTORY_PALETTE), printer=buildFactoryPrinter(FACTORY_PALETTE);
  for(const contact of worklife.contacts)w.createCollider(R.ColliderDesc.trimesh(contact.vertices,contact.indices).setFriction(.85),fixed);
  const solids=printer.solids; worklife.dispose(); printer.dispose();
  for(const s of solids){
    const c=R.ColliderDesc.cuboid(...s.size.map(v=>v/2)).setTranslation(...s.at);
    if(s.rotation){const q=new Quaternion().setFromEuler(new Euler(...s.rotation,'YXZ'));c.setRotation(q);}
    w.createCollider(c,fixed);
  }
  return w;
}
const dispose=g=>{g.geometry.dispose();g.roofs.dispose();g.surface.dispose();};
test('merged factory structure assigns its whole installed colour batch to actual surfaces or floor marks', () => {
  const model = buildFactoryGeometry(), positions = model.geometry.attributes.position.array, indices = model.geometry.index.array;
  try {
    const contacts = [...model.rails, ...model.structureContacts].sort((a,b)=>a.firstIndex-b.firstIndex);
    let previous = 0;
    for (const { id, firstIndex, indexCount, vertices, indices: local } of contacts) {
      assert.ok(firstIndex >= previous, id);
      assert.equal(indexCount, local.length, id);
      const baseVertex = indices[firstIndex] - local[0];
      assert.deepEqual(positions.subarray(baseVertex * 3, baseVertex * 3 + vertices.length), vertices, id);
      for (let i = 0; i < indexCount; i++) assert.equal(indices[firstIndex + i] - baseVertex, local[i], id);
      previous = firstIndex + indexCount;
    }
    const ranges = [...contacts, ...model.structureDecorations].sort((a,b)=>a.firstIndex-b.firstIndex);
    assert.equal(new Set(ranges.map(range=>range.id)).size, ranges.length);
    let cursor = 0;
    for (const range of ranges) { assert.equal(range.firstIndex,cursor,range.id); cursor += range.indexCount; }
    assert.equal(cursor,indices.length);
    assert.deepEqual(model.structureDecorations.map(range=>range.id),
      ['factory-floor-markings','factory-routing-transfer-marks','factory-forecourt-staging-markings']);
  } finally { dispose(model); }
});

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
    assert.ok(g.triangles>2000 && g.triangles<69000,g.triangles);
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
  const g=buildFactoryGeometry(),w=worldFor(g),pose={x:0,y:0,z:0,w:1};
  try{
    w.step();
    for(const z of [-11,2,15]){
      // The workpiece travels out along +X through the real post openings.
      const hit=w.intersectionWithShape({x:-23.45,y:1.8,z},pose,new R.Cuboid(1.45,.4,.6));
      assert.equal(hit,null,`press ${z} outfeed blocked`);
    }
  }finally{w.free();dispose(g);}
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
      if (['frame','wheels','shell'].includes(station)) {
        const old = w.castShape({x:target[0],y:target[1],z:target[2]},{x:0,y:0,z:0,w:1},
          {x:-39-target[0],y:5.2-target[1],z:3.5},new R.Ball(.18),0,1,true);
        assert.ok(old&&old.time_of_impact<.35,station+' must still collide with the actual luminaire on the old camera sweep');
      }
    }
  }finally{w.free();dispose(g);}
});

test('every factory console advertises clear capsule routes and rejects visible obstructed approaches',()=>{
  const g=buildFactoryGeometry();
  const w=worldFor(g), registry=createActorActivities(), release=registerFactoryActivity(registry);
  const body=w.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations());
  const capsule=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  w.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);w.step();
  const origin=factoryWorld([0,0,0]), local=p=>p.map((v,i)=>v-origin[i]);
  const groundRoute=(from,to,limit)=>{
    const end=pickupGroundRoute(w,R,body,local(from),local(to),limit);
    return end&&factoryWorld(end);
  };
  useFactoryStore.setState({active:true});useWorldStore.setState({paused:false,factoryStation:null});
  try{
    for(const station of FACTORY_STATIONS){
      const [x,y,z]=station.at, samples=new Set();
      for(let degrees=0; degrees<360; degrees+=15){
        const angle=degrees*Math.PI/180,px=x+2*Math.cos(angle),pz=z+2*Math.sin(angle);
        const hit=w.castRay(new R.Ray({x:px,y:y+2.5,z:pz},{x:0,y:-1,z:0}),4,true,undefined,undefined,undefined,body);
        if(!hit)continue;
        const point={x:px,y:y+2.5-hit.timeOfImpact+PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.001,z:pz};
        if(w.intersectionWithShape(point,body.rotation(),capsule,undefined,undefined,undefined,body)
          || !playerSupport(w,R,body,point,true)?.grounded || !interactionVisible(w,R,body,point,station.at))continue;
        const from=[point.x,point.y,point.z], position=factoryWorld(from);
        const path=pickupGroundRoute(w,R,body,from,station.at,station.radius);
        const reachable=!!path && Math.abs(path[1]-(y+PLAYER_HALF_HEIGHT+PLAYER_RADIUS))<.25;
        registry.sync({position,grounded:true,available:true,yaw:0,mode:'guide',groundRoute});
        assert.equal(canOpenFactoryStation(station.id),reachable,station.id+' prompt '+degrees);
        assert.equal(openFactoryStation(station.id),reachable,station.id+' action '+degrees);
        assert.equal(useWorldStore.getState().factoryStation,reachable?station.id:null);
        closeFactoryStation();samples.add(reachable);
      }
      assert.deepEqual(samples,new Set([false,true]),station.id+' needs both clear and blocked approaches');
    }
  }finally{release();dispose(g);w.free();}
});

test('rechecking the moving raw-console approach sees its continuous floor at the live coordinates',()=>{
  const g=buildFactoryGeometry(), w=worldFor(g), origin=factoryWorld([0,0,0]);
  const fixed=[];w.forEachRigidBody(body=>fixed.push(body));
  for(const body of fixed)body.setTranslation({x:origin[0],y:origin[1],z:origin[2]},false);
  const stand=factoryWorld(FACTORY_STATIONS.find(s=>s.id==='raw').at);
  const player=w.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations());
  w.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),player);
  w.step();
  try {
    const from=[-234.5,1.9388248920440674,-13.49];
    const samples=[from,[-234.501953125,1.93882417678833,-13.437],[-234.4982,1.9388248920440674,-13.44]];
    for(const position of samples)
      assert.ok(pickupGroundRoute(w,R,player,position,stand,2.1),'the actual south aisle stays open at '+position.join(', '));
    w.createCollider(R.ColliderDesc.cuboid(.2,.4,.12).setTranslation(-234.5,1.52,-12.95));
    w.step();
    assert.equal(pickupGroundRoute(w,R,player,from,stand,2.1),null,'a later physical obstacle still rejects the route');
  }finally{w.free();dispose(g);}
});

test('factory ramp, balcony and test-lane guard gaps stay open between the actual posts and beams', t => {
  const g=buildFactoryGeometry(), w=new R.World({x:0,y:-9.81,z:0});
  t.after(()=>{w.free();dispose(g);});
  const body=w.createRigidBody(R.RigidBodyDesc.fixed());
  let open=0, bars=0, oldBlocked=0;
  assert.equal(g.rails.length,13);
  for(const rail of g.rails){
    const collider=w.createCollider(R.ColliderDesc.trimesh(rail.vertices,rail.indices),body);
    const a=new Vector3(...rail.start), b=new Vector3(...rail.end), axis=b.clone().sub(a);
    const bays=Math.ceil(axis.length()/2.6), n=new Vector3(axis.z,0,-axis.x).normalize();
    const oldRotation=new Quaternion().setFromEuler(new Euler(-Math.atan2(axis.y,Math.hypot(axis.x,axis.z)),Math.atan2(axis.x,axis.z),0));
    const mid=a.clone().lerp(b,.5);mid.y+=.58;
    const former=w.createCollider(R.ColliderDesc.cuboid(.06,.58,axis.length()/2).setTranslation(mid.x,mid.y,mid.z).setRotation(oldRotation),body);
    for(let bay=0;bay<bays;bay++){
      const center=a.clone().lerp(b,(bay+.5)/bays);
      for(const h of [.28,.55,.82,1.13]){
        const from=center.clone().addScaledVector(n,-.25);from.y+=h;
        const ray=new R.Ray(from,n), hit=collider.castRay(ray,.5,false);
        if(h===.55||h===1.13){assert.ok(hit>.18&&hit<.25,rail.id+' beam'); bars++;}
        else {assert.equal(hit,-1,rail.id+' empty bay');open++;if(former.castRay(ray,.5,true)>=0)oldBlocked++;}
      }
    }
    // The render batch remains one draw. Check every referenced index maps to
    // the same authored vertex as the corresponding compact Rapier triangle.
    for(let i=0;i<rail.indexCount;i++){
      const real=g.geometry.index.getX(rail.firstIndex+i), compact=rail.indices[i];
      for(let axis=0;axis<3;axis++) assert.equal(g.geometry.attributes.position.getComponent(real,axis),rail.vertices[3*compact+axis]);
    }
  }
  assert.ok(oldBlocked>120 && open>250);
  t.diagnostic(JSON.stringify({spans:g.rails.length,open,oldBlocked,bars}));
});
test('the two factory roof forms support from above and leave the overhead working space clear', t=>{
  const g=buildFactoryGeometry(), w=worldFor(g);t.after(()=>{w.free();dispose(g);});
  const roof=new Mesh(g.roofs,new MeshBasicMaterial());t.after(()=>roof.material.dispose());
  let n=0;
  for(const x of [-42,-18,-3,6,17,30,42])for(const z of [-28,-12,1,17,29]){
    const start=new Vector3(x,30,z),down=new Vector3(0,-1,0);
    const view=new Raycaster(start,down).intersectObject(roof,false)[0];assert.ok(view);
    w.step();
    const hit=w.castRay(new R.Ray(start,down),35,true);
    assert.ok(hit && Math.abs(hit.timeOfImpact-view.distance)<.001,`${x},${z}`);n++;
  }
  const up=w.castRay(new R.Ray({x:8,y:9.2,z:0},{x:0,y:1,z:0}),12,false);
  assert.ok(up && up.timeOfImpact>4.5,'assembly crane overhead clearance');
  t.diagnostic(n+' roof support/facing rays');
});
