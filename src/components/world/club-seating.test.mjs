import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import R from '@dimforge/rapier3d-compat';
import { buildDjcClubGeometry,DJC_CLUB_SEATS,DJC_DAYBED_TOP,DJC_DAYBED_ACCESS,DJC_MIRROR_POSITION,DJC_MIRROR_RADIUS } from './WorldDjcClubGeometry.ts';
import { registerInteractable,nearestInteractable,interactables } from './WorldInteract.ts';
import { useWorldStore } from './store.ts';
import { PLAYER_CENTER_HEIGHT,PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from './actor-physics.ts';
import { sweepCamera } from './camera-collision.ts';
import { playerSupport,followPlayerGround } from './player-ground.ts';
import { createPlayerClearance,sweptPlayerVelocity,playerVelocityChange } from './player-motion.ts';
import { CLUB_POOL } from './djc-club-layout.ts';
// The focused interaction fixture loads the real runtime registration code, not the unrelated
// dancer/visual asset tree. Rendering and React mounting remain part of browser acceptance.
const hook=registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith('/WorldDjcClub.tsx')&&['./WorldClubDancer','./WorldDjcClubVisual'].includes(specifier))return{url:'data:text/javascript,export default function RenderOnlyFixture(){return null}',shortCircuit:true};return next(specifier,context);}});
const {djcSeatInteraction,djcSeatApproach,djcSeatReachable}=await import('./WorldDjcClub.tsx');hook.deregister();
await R.init();
const geometry=buildDjcClubGeometry(),world=new R.World({x:0,y:-12.5,z:0});
for(const [kind,m]of Object.entries(geometry.colliders)){const b=world.createRigidBody(R.RigidBodyDesc.fixed());b.userData={[kind]:true};world.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices),b);}
const player=world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations()),bodyShape=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),player);
const place=p=>{player.setTranslation({x:p[0],y:p[1],z:p[2]},true);player.setLinvel({x:0,y:0,z:0},true);for(let i=0;i<30;i++)world.step();const actual=player.translation();useWorldStore.setState({position:[actual.x,actual.y,actual.z],seat:null,clubMode:null,activeVehicle:null,card:null});};
// Approach each seat from its half of the flat landing, rather than spawning inside
// the round cushion lip and relying on a solver nudge to select one of two ties.
const front=s=>[s.center[0]+Math.sign(s.position[0]-s.center[0])*.35,DJC_DAYBED_TOP+PLAYER_CENTER_HEIGHT,s.center[1]+(DJC_DAYBED_ACCESS.landingZ+DJC_DAYBED_ACCESS.toZ)/2];
test('eight real seat interactions register, sit with exact support, clear for existing stand-up, and unregister',()=>{
  const cleanup=DJC_CLUB_SEATS.map(s=>registerInteractable(djcSeatInteraction(s,()=>djcSeatReachable(world,R,useWorldStore.getState().position,s))));
  assert.equal([...interactables()].filter(i=>i.id.startsWith('djc-daybed-')).length,8);
  for(const seat of DJC_CLUB_SEATS){const p=front(seat);place(p);const pick=nearestInteractable(...p,undefined,seat.id);assert.equal(pick?.item.id,seat.id);pick.item.onInteract();assert.equal(useWorldStore.getState().seat?.id,seat.id);assert.equal(useWorldStore.getState().seat.position[1],DJC_DAYBED_TOP);useWorldStore.setState({seat:null});assert.equal(useWorldStore.getState().seat,null);}
  cleanup.forEach(fn=>fn());assert.equal([...interactables()].filter(i=>i.id.startsWith('djc-daybed-')).length,0);
});
test('pool-level, rear and distant approaches cannot sit; a newly inserted obstruction is rechecked on activation',()=>{
  const seat=DJC_CLUB_SEATS[0],p=front(seat);
  for(const q of [[p[0],.6+PLAYER_CENTER_HEIGHT,p[2]],[p[0],p[1],seat.position[2]+1],[p[0],p[1],seat.position[2]-4]])assert.equal(djcSeatApproach(q,seat),false);
  place(p);const item=djcSeatInteraction(seat,()=>djcSeatReachable(world,R,useWorldStore.getState().position,seat));assert.ok(item.enabled());
  const wall=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation((p[0]+seat.position[0])/2,DJC_DAYBED_TOP+1,(p[2]+seat.position[2])/2));world.createCollider(R.ColliderDesc.cuboid(1,1,.08),wall);world.step();
  assert.equal(item.enabled(),false);item.onInteract();assert.equal(useWorldStore.getState().seat,null);world.removeRigidBody(wall);
});
test('each seated anchor has a supported clear landing within the existing stand-up search envelope',()=>{
  for(const seat of DJC_CLUB_SEATS) {
    place(front(seat));let exits=0;
    for(const offset of [0,Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI*.75,-Math.PI*.75,Math.PI])for(const distance of [.65,.7,.8,.9]) {
      const a=seat.yaw+offset,x=seat.position[0]+Math.cos(a)*distance,z=seat.position[2]-Math.sin(a)*distance;
      const top=front(seat)[1]+.525,hit=world.castRayAndGetNormal(new R.Ray({x,y:top,z},{x:0,y:-1,z:0}),3,true,undefined,undefined,undefined,player,c=>!c.isSensor()&&!!c.parent()?.isFixed());
      if(!hit||hit.normal.y<.91)continue;const y=top-hit.timeOfImpact+PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.01;let blocked=false;
      world.intersectionsWithShape({x,y,z},{x:0,y:0,z:0,w:1},bodyShape,()=>{blocked=true;return false;},undefined,undefined,undefined,player,c=>!c.isSensor());if(!blocked)exits++;
    }
    assert.ok(exits>0,`stand-up is clear for ${seat.id}`);
  }
});
test('mirror fixed sphere has physical contact and stops the production camera sweep',()=>{
  const [x,y,z]=DJC_MIRROR_POSITION,b=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,y,z));b.userData={solid:true,assetId:'djc-mirror-ball',cameraBlocker:true};world.createCollider(R.ColliderDesc.ball(DJC_MIRROR_RADIUS),b);world.step();
  let touched=false;world.intersectionsWithShape({x,y,z},{x:0,y:0,z:0,w:1},new R.Ball(.1),c=>{if(c.parent()?.handle===b.handle)touched=true;return true;});assert.ok(touched);
  const cast=sweepCamera(world,R,{x:x-2,y,z},{x:x+2,y,z},.22,player,c=>!c.isSensor());assert.ok(cast.hit!==null);assert.ok(cast.distance<1.2);assert.equal(b.userData.cameraBlocker,true);
});
test('production dynamic capsule walks from pool to every daybed, stops on the landing and activates a reachable seat',()=>{
 for(const bed of [0,1,2,3])for(const offset of [-.41,.41]) {
  const w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
  for(const [kind,m]of Object.entries(geometry.colliders)){const b=w.createRigidBody(R.RigidBodyDesc.fixed());b.userData={[kind]:true};w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices).setFriction(kind==='surface'?.9:.65),b);}
  w.step();
  const seat=DJC_CLUB_SEATS[bed*2],x=seat.center[0]+offset,startZ=seat.center[1]+DJC_DAYBED_ACCESS.fromZ-.5;
  const floor=w.castRay(new R.Ray({x,y:10,z:startZ},{x:0,y:-1,z:0}),12,true),y=10-floor.timeOfImpact;
  const body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,y+PLAYER_CENTER_HEIGHT,startZ).lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false));
  w.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),body);const guard=createPlayerClearance(w);
  const tick=speed=>{const ground=playerSupport(w,R,body),change=playerVelocityChange(body.linvel(),{x:0,y:0,z:speed},1/60,ground?.grounded??false);body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();};
  for(let i=0;i<45;i++)tick(0);let reached=false;
  for(let i=0;i<240;i++){tick(3.6);if(body.translation().z>=seat.center[1]-1.55){reached=true;break;}}
  const arrived={...body.translation()};for(let i=0;i<60;i++)tick(0);const settled={...body.translation()};for(let i=0;i<180;i++)tick(0);const stopped={...body.translation()},support=playerSupport(w,R,body);
  const holdDrift=Math.hypot(stopped.x-settled.x,stopped.y-settled.y,stopped.z-settled.z);
  const record={bed,offset,reached,arrived,stopped,grounded:support?.grounded??false,gap:support?.gap,holdDrift};console.log('dynamic daybed:',JSON.stringify(record));
  assert.ok(reached,JSON.stringify(record));assert.ok(Math.hypot(stopped.x-arrived.x,stopped.z-arrived.z)<.3,JSON.stringify(record));assert.ok(Math.hypot(stopped.x-settled.x,stopped.y-settled.y,stopped.z-settled.z)<.015,JSON.stringify(record));assert.ok(support?.grounded,JSON.stringify(record));
  const p=[stopped.x,stopped.y,stopped.z];useWorldStore.setState({position:p,seat:null,clubMode:null,activeVehicle:null,card:null});
  const cleanup=DJC_CLUB_SEATS.filter(s=>s.bed===bed).map(s=>registerInteractable(djcSeatInteraction(s,()=>djcSeatReachable(w,R,useWorldStore.getState().position,s))));
  const sight=item=>{const d=[item.position[0]-stopped.x,item.position[1]+.2-stopped.y-.45,item.position[2]-stopped.z],length=Math.hypot(...d);return !w.castRay(new R.Ray({x:stopped.x,y:stopped.y+.45,z:stopped.z},{x:d[0]/length,y:d[1]/length,z:d[2]/length}),Math.max(0,length-.3),true,undefined,undefined,undefined,body,c=>!c.isSensor());};
  const picked=nearestInteractable(...p,sight);assert.ok(picked?.item.id.startsWith(`djc-daybed-${bed}-`),JSON.stringify(record));picked.item.onInteract();assert.equal(useWorldStore.getState().seat?.id,picked.item.id);useWorldStore.setState({seat:null});cleanup.forEach(fn=>fn());
  w.removeCharacterController(guard);w.free();
 }
});
test('production dynamic capsule leaves the pool through all four broad shallow bays',()=>{
 for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const side of [-1.2,1.2]) {
  const w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
  for(const [kind,m]of Object.entries(geometry.colliders)){const b=w.createRigidBody(R.RigidBodyDesc.fixed());b.userData={[kind]:true};w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices).setFriction(kind==='surface'?.9:.65),b);}
  const direction={x:Math.cos(angle),z:Math.sin(angle)},offset={x:-direction.z*side,z:direction.x*side};
  const from=CLUB_POOL.boundary(angle,-3),to=CLUB_POOL.boundary(angle,2.1),x=from[0]+offset.x,z=from[1]+offset.z,target={x:to[0]+offset.x,z:to[1]+offset.z};
  w.step();const floor=w.castRay(new R.Ray({x,y:10,z},{x:0,y:-1,z:0}),12,true);
  const body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,10-floor.timeOfImpact+PLAYER_CENTER_HEIGHT,z).lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false));
  w.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),body);const guard=createPlayerClearance(w);
  const tick=speed=>{const ground=playerSupport(w,R,body),change=playerVelocityChange(body.linvel(),{x:direction.x*speed,y:0,z:direction.z*speed},1/60,ground?.grounded??false);body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();};
  for(let i=0;i<30;i++)tick(0);let reached=false;
  for(let i=0;i<240;i++){tick(3.6);const p=body.translation();if((p.x-target.x)*direction.x+(p.z-target.z)*direction.z>=0){reached=true;break;}}
  for(let i=0;i<60;i++)tick(0);const p=body.translation(),support=playerSupport(w,R,body),record={angle,side,reached,position:p,grounded:support?.grounded};
  console.log('dynamic pool exit:',JSON.stringify(record));assert.ok(reached,JSON.stringify(record));assert.ok(support?.grounded,JSON.stringify(record));assert.ok(p.y>1.38+PLAYER_HALF_HEIGHT+PLAYER_RADIUS,JSON.stringify(record));
  w.removeCharacterController(guard);w.free();
 }
});
after(()=>{Object.values(geometry.batches).forEach(g=>g.dispose());geometry.pool.dispose();world.free();});
