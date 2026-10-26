import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PHYSICS_STEP, PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../../src/components/world/actor-physics.ts';
import { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } from '../../../src/components/world/player-motion.ts';
import { playerSupport, followPlayerGround } from '../../../src/components/world/player-ground.ts';
const require=createRequire(import.meta.url);
const entry=require.resolve('@dimforge/rapier3d-compat',{paths:[require.resolve('@react-three/rapier')]});
export const {default:RAPIER}=await import(entry);await RAPIER.init();
const root=process.env.ALPHA_MINE_TEST_ASSETS?pathToFileURL(process.env.ALPHA_MINE_TEST_ASSETS.replace(/\/$/,'')+'/'):new URL('../../../public/world/alpha-mine/',import.meta.url);
export const layout=JSON.parse(readFileSync(new URL('layout.json',root),'utf8'));
export function quarryWalkCases(){
  const exits=Object.entries(layout.lowExits??{});
  return {
    ...Object.fromEntries(exits),
    ...Object.fromEntries(exits.map(([name,p])=>[name+'-reverse',[...p].reverse()])),
    'core-west-ramp':[[-8.8,0,-2.55],[-11.8,0,-2.55],[-11.8,0,-9],[-11.8,3,-21]],
    'outer-west-ramp':[[-15.8,0,-2],[-19,0,-2],[-19,0,-3],[-19,3,-15]],
    'crate-east-approach':[[-12,0,-4.2],[-12,0,-7.4],[-11.8,0,-9],[-11.8,3,-21]],
    'west-low-side-entry':[[-16.2,0,-18],[-15.8,0,-18],...(layout.lowExits?.['west-support-to-entrance']??[]).slice(2)],
    'outer-west-east-edge':[[-17.1,0,-9],[-15.8,0,-9],[-15.8,0,-2],[-5.2,0,-2],[0,0,0]],
  };
}
export const lowPocketAttempts={
  south:[[-14.2,0,-5.6],[-14.2,0,-3.4],[-14.2,0,-2.5],[-11.8,0,-2.5],[0,0,0]],
  north:[[-14.2,0,-5.6],[-14.2,0,-7.1],[-13.2,0,-7.8],[-11.8,0,-7.8],[-11.8,0,-2.55],[0,0,0]],
};
export function quarryWorld(){
  const proxy=JSON.parse(readFileSync(new URL('colliders.json',root),'utf8'));
  const world=new RAPIER.World({x:0,y:-12.5,z:0});world.timestep=PHYSICS_STEP;
  for(const [kind,p] of Object.entries(proxy)){
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());body.userData={kind};
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(p.vertices),new Uint32Array(p.indices)).setFriction(.9).setRestitution(0),body);
  }
  world.step();return world;
}
const vector=p=>({x:p[0],y:p[1],z:p[2]});
const tuple=p=>[p.x,p.y,p.z].map(v=>+v.toFixed(4));
/** Real continuous dynamic walk: the only placement is the initial spawn. No jumping or recovery. */
export function walkQuarry(points,{speed=3.6,tolerance=.18,analogue=false}={}){
  const world=quarryWorld(),start=points[0],body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start[0],start[1]+PLAYER_CENTER_HEIGHT,start[2]).lockRotations().setLinearDamping(.2)
    .setCcdEnabled(true).setSoftCcdPrediction(.1).setCanSleep(false));
  world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0),body);
  const guard=createPlayerClearance(world);let frames=0,segment=1,walked=0,previous=body.translation(),reason='reached';
  const position=()=>{const p=body.translation();return [p.x,p.y-PLAYER_HALF_HEIGHT-PLAYER_RADIUS,p.z].map(v=>+v.toFixed(4));};
  try{
    let blocked=false;
    world.intersectionsWithShape(body.translation(),body.rotation(),new RAPIER.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),()=>{blocked=true;return false;},
      undefined,undefined,undefined,body,c=>c.parent()?.userData?.kind==='solid');
    if(blocked)return {passed:false,reason:'spawn-overlaps-solid',segment:0,position:position(),goal:start,frames,walked};
    for(let i=0;i<45;i++)world.step();
    for(;segment<points.length;segment++){
      const goal=vector(points[segment]),initial=body.translation(),length=Math.hypot(goal.x-initial.x,goal.z-initial.z);
      const budget=Math.ceil((length/1.2+3)*60);let reached=false;
      for(let step=0;step<budget;step++){
        const p=body.translation(),dx=goal.x-p.x,dz=goal.z-p.z,d=Math.hypot(dx,dz),foot=p.y-PLAYER_HALF_HEIGHT-PLAYER_RADIUS;
        if(d<tolerance&&Math.abs(foot-goal.y)<.20){reached=true;break;}
        if(foot<Math.min(points[segment-1][1],goal.y)-.6){reason='fell-below-route';break;}
        const v=body.linvel(),grounded=!!playerSupport(world,RAPIER,body)?.grounded;
        // Default is the runtime's full walking target. Optional analogue braking is diagnostic only.
        const pace=analogue?Math.min(speed,Math.max(.4,(d-tolerance/2)*6)):speed;
        const target={x:dx/Math.max(d,1e-6)*pace,y:0,z:dz/Math.max(d,1e-6)*pace};
        const change=playerVelocityChange(v,target,PHYSICS_STEP,grounded);
        body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);
        const velocity=body.linvel(),safe=sweptPlayerVelocity(guard,body,velocity,PHYSICS_STEP,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
        if(safe!==velocity)body.setLinvel(safe,true);
        followPlayerGround(world,RAPIER,body,body.linvel(),PHYSICS_STEP,false);world.step();frames++;
        const next=body.translation();walked+=Math.hypot(next.x-previous.x,next.z-previous.z);previous=next;
      }
      if(!reached){if(reason==='reached')reason='blocked-or-stalled';break;}
    }
    const contacts=[];
    for(let i=0;i<guard.numComputedCollisions();i++){
      const c=guard.computedCollision(i);if(c)contacts.push({kind:c.collider?.parent()?.userData?.kind,normal:tuple(c.normal1),witness:tuple(c.witness1)});
    }
    return {passed:segment===points.length,reason,segment,position:position(),goal:points[Math.min(segment,points.length-1)],
      frames,walked:+walked.toFixed(2),contacts:contacts.slice(0,4)};
  }finally{world.removeCharacterController(guard);world.free();}
}
