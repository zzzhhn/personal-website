import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { ALPHA_EXCHANGE_ORIGIN, EXCHANGE_HALL, exchangeWorld, exchangeBoxes } from './alpha-exchange-layout.ts';
import { EXCHANGE_PLAY_STATIONS } from './alpha-exchange-play-layout.ts';
import { orbitDirection, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { cameraCollisionRadius, cameraLookTarget, sweepCamera } from './camera-collision.ts';
await R.init();
const radius=cameraCollisionRadius(.1,50,16/9),identity={x:0,y:0,z:0,w:1};
const point=v=>({x:v[0],y:v[1],z:v[2]});
const local=v=>point(exchangeWorld(v)),restHeight=PLAYER_HALF_HEIGHT+PLAYER_RADIUS;
const board=exchangeBoxes().find(b=>b.id==='market-board');
assert.ok(board,'the physical historical board remains present');
const boardFront=ALPHA_EXCHANGE_ORIGIN[2]+board.center[2]+board.size[2]/2;
// A reachable reading position on the rear mezzanine. The legal smoothed camera pivot
// sits 66 cm behind its body, near the actual board face, exercising orbit compression.
const player=local([0,EXCHANGE_HALL.galleryY+restHeight,-38.8]);
const inward=orbitDirection(3*Math.PI/2,.455);
const reported={x:player.x,y:player.y+.65,z:boardFront+radius+.0499*Math.abs(inward[2])};
const solid=c=>!c.isSensor();
const endpoint=(from,dir,d)=>({x:from.x+dir[0]*d,y:from.y+dir[1]*d,z:from.z+dir[2]*d});
const sweep=(world,from,to)=>sweepCamera(world,R,from,to,radius,undefined,solid);
function overlaps(world,p){
  let hit=false;
  world.intersectionsWithShape(p,identity,new R.Ball(radius),()=>{hit=true;return false;});return hit;
}
function withExchange(run){
  const built=buildAlphaExchangeGeometry(),world=new R.World({x:0,y:0,z:0});
  try{
    for(const mesh of Object.values(built.colliders)){
      const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_EXCHANGE_ORIGIN));
      world.createCollider(R.ColliderDesc.trimesh(mesh.vertices,mesh.indices),body);
    }world.step();run(world);
  }finally{world.free();built.body.dispose();built.glass.dispose();}
}
function viewDirection(position,target,dir){
  const camera=new PerspectiveCamera(50,16/9,.1,600),aim=cameraLookTarget(position,target,dir);
  camera.position.copy(position);camera.lookAt(aim.x,aim.y,aim.z);
  assert.ok(camera.quaternion.toArray().every(Number.isFinite));
  return camera.getWorldDirection(new Vector3());
}

test('actual rear-gallery orbit contacts the board outer face rather than a penetrating start or internal mesh edge',t=>withExchange(world=>{
  const desired={...player,y:player.y+.65},dir=inward;
  assert.equal(overlaps(world,player),false);assert.equal(overlaps(world,desired),false);
  const pivot=sweep(world,player,reported);
  assert.equal(overlaps(world,pivot.position),false);
  assert.ok(Math.hypot(pivot.position.x-reported.x,pivot.position.y-reported.y,pivot.position.z-reported.z)<1e-6);
  assert.equal(overlaps(world,reported),false,'near-zero orbit starts outside the physical board');
  const cast=(w,stop)=>w.castShape(reported,identity,{x:dir[0],y:dir[1],z:dir[2]},new R.Ball(radius),0,13.5,stop);
  const hit=cast(world,true),leaving=cast(world,false);
  assert.ok(hit.time_of_impact>.049&&hit.time_of_impact<.051);
  assert.ok(Math.abs(hit.time_of_impact-leaving.time_of_impact)<1e-6,'stopAtPenetration is not causing contact');
  assert.ok(Math.abs(hit.witness1.z-boardFront)<.001&&hit.normal1.z>.999);
  const primitiveWorld=new R.World({x:0,y:0,z:0});
  try{
    primitiveWorld.createCollider(R.ColliderDesc.cuboid(...board.size.map(v=>v/2)).setTranslation(...exchangeWorld(board.center)));primitiveWorld.step();
    const primitive=cast(primitiveWorld,true);
    assert.ok(Math.abs(hit.time_of_impact-primitive.time_of_impact)<.001,'convex board and actual merged mesh agree');
  }finally{primitiveWorld.free();}
  const orbit=sweep(world,reported,endpoint(reported,dir,13.5));
  assert.ok(orbit.distance<.001);assert.equal(overlaps(world,orbit.position),false);
  assert.ok(viewDirection(orbit.position,reported,dir).dot(new Vector3(...dir).negate())>1-1e-10);
  const closer={...reported,z:reported.z-.002},closed=sweep(world,closer,endpoint(closer,dir,13.5));
  assert.equal(overlaps(world,closer),false);
  assert.equal(closed.distance,0,'2 mm closer remains legal and exercises exact zero-distance Rapier contact');
  assert.ok(viewDirection(closed.position,closer,dir).dot(new Vector3(...dir).negate())>1-1e-10);
  t.diagnostic(`board TOI=${hit.time_of_impact.toFixed(6)} m; orbit after margin=${orbit.distance.toFixed(6)} m`);
}));

test('manual drag retains collision-safe yaw and pitch when the real rear-board orbit fully compresses',t=>withExchange(world=>{
  const desired=new Vector3(reported.x,reported.y,reported.z),target=desired.clone(),yaw0=Math.atan2(.8,.6);
  let actual=13.5,last,closed=0;
  for(let frame=0;frame<220;frame++){
    const yaw=frame<20?yaw0:frame<40?yaw0+117*.0055:yaw0+(117+571)*.0055;
    const pitch=frame<40?.125:.455,dir=orbitDirection(yaw,pitch);
    target.lerp(desired,1-Math.exp(-10/60));
    const pivot=sweep(world,player,target);target.copy(pivot.position);
    const orbit=sweep(world,target,endpoint(target,dir,13.5));
    actual=orbit.distance<actual?orbit.distance:actual+(orbit.distance-actual)*(1-Math.exp(-4/60));
    const position=endpoint(target,dir,actual),facing=viewDirection(position,target,dir);
    assert.equal(overlaps(world,target),false,`frame ${frame}: pivot`);
    assert.equal(overlaps(world,position),false,`frame ${frame}: camera`);
    if(frame>=40){
      assert.ok(position.z>boardFront,'compressed camera never crosses the board');
      assert.ok(position.y<ALPHA_EXCHANGE_ORIGIN[1]+EXCHANGE_HALL.galleryY+2,'compression never lifts onto another level');
    }
    assert.ok(facing.dot(new Vector3(...dir).negate())>1-1e-10,`frame ${frame}: manual heading`);
    if(actual<.001)closed++;
    last={pivot:target.toArray(),distance:actual,position};
  }
  assert.ok(closed>100,'exercise sustained zero-distance framing');assert.ok(last.distance<.001);
  t.diagnostic(`220 production-style frames; ${closed} near-zero frames; final ${JSON.stringify(last)}`);
}));

test('normal exterior and seated pit-aisle framing keep their exact target, including seated compression',()=>withExchange(world=>{
  for(const sample of [
    {body:{x:40,y:1.97,z:-40},target:{x:40,y:2.62,z:-40},aim:{x:40,y:2.62,z:-40},dir:orbitDirection(Math.atan2(.8,.6),.455)},
    // A seated regression sample in the clear eastern pit aisle, away from the circular desk.
    // Cushion+.92 is the sweep pivot and cushion+.45 the independent chest aim.
    {body:local([6,.88,-20]),target:local([6,1.12,-20]),aim:local([6,.65,-20]),dir:orbitDirection(Math.PI/2,.455)},
  ]){
    const pivot=sweep(world,sample.body,sample.target),orbit=sweep(world,pivot.position,endpoint(pivot.position,sample.dir,5));
    assert.equal(overlaps(world,orbit.position),false);
    const aim=cameraLookTarget(orbit.position,sample.aim,sample.dir);assert.equal(aim,sample.aim);
    const expected=new Vector3(sample.aim.x-orbit.position.x,sample.aim.y-orbit.position.y,sample.aim.z-orbit.position.z).normalize();
    assert.ok(viewDirection(orbit.position,sample.aim,sample.dir).dot(expected)>1-1e-10);
  }
  const chest={...reported,y:reported.y-.47},dir=inward;
  assert.equal(cameraLookTarget(reported,chest,dir),chest,'compressed seated view still frames the chest');
  assert.ok(viewDirection(reported,reported,dir).dot(new Vector3(...dir).negate())>1-1e-10,'exact-zero lookAt is deterministic');
}));

test('a near-clearance head pivot stays below a test-only beam over the actual v2 gallery',()=>withExchange(world=>{
  // The old low clock beam was removed by the 14 m open-coffer redesign. Retain the
  // overlapping-head-pivot regression explicitly, without pretending it is runtime art.
  const body=local([0,EXCHANGE_HALL.galleryY+restHeight,-37.6]),underside=body.y+restHeight+.03;
  world.createCollider(R.ColliderDesc.cuboid(5.5,.11,.325).setTranslation(body.x,underside+.11,body.z-.13));world.step();
  const desired={...body,y:body.y+.65};
  assert.equal(overlaps(world,body),false);assert.equal(overlaps(world,desired),true);
  const pivot=sweep(world,body,desired);
  assert.equal(overlaps(world,pivot.position),false);
  assert.ok(pivot.position.y<underside-radius,'head pivot stops under the beam instead of lifting through it');
  assert.ok(pivot.distance>.5&&pivot.distance<.65,'retain a useful head-height pivot');
}));

test('real side wall, rear wall and 14 m coffer constrain sweeps while the open roof cell stays open',()=>withExchange(world=>{
  const cases=[
    {name:'side-window wall',from:local([15,8,-12]),to:local([21,8,-12]),check:p=>p.x<ALPHA_EXCHANGE_ORIGIN[0]+18},
    {name:'rear gallery wall',from:local([8,EXCHANGE_HALL.galleryY+restHeight+.65,-37.6]),to:local([8,EXCHANGE_HALL.galleryY+restHeight+.65,-45]),check:p=>p.z>ALPHA_EXCHANGE_ORIGIN[2]+EXCHANGE_HALL.back},
    {name:'front cross coffer',from:local([3,8,-9]),to:local([3,16,-9]),check:p=>p.y<ALPHA_EXCHANGE_ORIGIN[1]+EXCHANGE_HALL.height},
  ];
  for(const c of cases){
    assert.equal(overlaps(world,c.from),false,`${c.name}: legal start`);
    const result=sweep(world,c.from,c.to);
    assert.notEqual(result.hit,null,`${c.name}: actual collider stops the camera`);
    assert.ok(result.distance>1&&result.distance<7,`${c.name}: useful bounded travel`);
    assert.equal(overlaps(world,result.position),false,`${c.name}: safe endpoint`);
    assert.ok(c.check(result.position),`${c.name}: remains on the starting side`);
  }
  const open=sweep(world,local([3,8,-4.5]),local([3,16,-4.5]));
  assert.equal(open.hit,null,'the cutaway has no invisible solid roof over its open cells');
  assert.ok(Math.abs(open.distance-8)<1e-6);assert.equal(overlaps(world,open.position),false);
}));

test('entrance, tactile stations and connected gallery retain a clear playable third-person corridor',()=>withExchange(world=>{
  const soles=[
    ['entrance',[0,0,.2]],
    ...Object.entries(EXCHANGE_PLAY_STATIONS).map(([name,s])=>[name,[...s.stand]]),
    ['gallery',[11.7,EXCHANGE_HALL.galleryY,-37.6]],
  ];
  const dir=orbitDirection(Math.PI/2,.25);
  for(const[name,sole]of soles){
    const body=local([sole[0],sole[1]+restHeight,sole[2]]),desired={...body,y:body.y+.65};
    assert.equal(overlaps(world,body),false,`${name}: clear body camera anchor`);
    const pivot=sweep(world,body,desired),orbit=sweep(world,pivot.position,endpoint(pivot.position,dir,13.5));
    assert.equal(overlaps(world,pivot.position),false,`${name}: pivot`);
    assert.equal(overlaps(world,orbit.position),false,`${name}: orbit`);
    assert.ok(orbit.distance>=2,`${name}: preserve a readable corridor rather than a fully compressed view`);
    assert.ok(viewDirection(orbit.position,pivot.position,dir).dot(new Vector3(...dir).negate())>1-1e-10,`${name}: requested view direction`);
  }
}));
