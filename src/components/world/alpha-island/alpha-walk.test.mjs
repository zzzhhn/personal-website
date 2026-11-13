import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { ALPHA_MAIN_PATH } from './alpha-layout.ts';
import { alphaTerrainData,alphaHeight } from './alpha-terrain.ts';
import { playerSupport,followPlayerGround,compensatePlayerSlopeGravity,clearPlayerSlopeGravity } from '../player-ground.ts';
await RAPIER.init();
const dt=1/60;
function fixture(path){const d=alphaTerrainData(),w=new RAPIER.World({x:0,y:-12.5,z:0});w.timestep=dt;w.createCollider(RAPIER.ColliderDesc.trimesh(d.positions,d.surface));w.createCollider(RAPIER.ColliderDesc.trimesh(d.positions,d.solid));const p=path[0],body=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p[0],p[1]+.88,p[2]).lockRotations().setCcdEnabled(true));w.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0).setRestitution(0),body);w.step();return {w,body};}
function tick(w,b,vx=0,vz=0,jump=false){const support=playerSupport(w,RAPIER,b),v=b.linvel();b.setLinvel({x:vx,y:jump?5:v.y,z:vz},true);compensatePlayerSlopeGravity(w,b,support,dt,jump);followPlayerGround(w,RAPIER,b,b.linvel(),dt,jump);w.step();clearPlayerSlopeGravity(b);}
for(const [name,speed,reverse] of [['walking-up',3.6,false],['running-down',6.2,true]])test(`actual dynamic terrain capsule ${name}, full route and stop`,t=>{const path=reverse?[...ALPHA_MAIN_PATH].reverse():ALPHA_MAIN_PATH,{w,body}=fixture(path);let steps=0,maxGap=0,worst=null,maxRayGap=0;
 for(let i=1;i<path.length;i++){const target=path[i],max=Math.ceil(Math.hypot(target[0]-path[i-1][0],target[2]-path[i-1][2])/speed*60)*3+120;let reached=false;
 for(let k=0;k<max;k++){const p=body.translation(),dx=target[0]-p.x,dz=target[2]-p.z,dist=Math.hypot(dx,dz);if(dist<.32){reached=true;break;}const pace=Math.min(speed,dist*6);tick(w,body,dx/dist*pace,dz/dist*pace);steps++;const now=body.translation(),gap=now.y-alphaHeight(now.x,now.z)-.82;if(Math.abs(gap)>maxGap){maxGap=Math.abs(gap);worst={segment:i,p:[now.x,now.y,now.z],expected:alphaHeight(now.x,now.z)};}const hit=w.castRay(new RAPIER.Ray({x:now.x,y:now.y,z:now.z},{x:0,y:-1,z:0}),4,true,undefined,undefined,undefined,body);if(hit)maxRayGap=Math.max(maxRayGap,hit.timeOfImpact-.82);assert.ok(now.y>alphaHeight(now.x,now.z)-.2,`fell through segment${i} ${JSON.stringify(now)}`);}
 assert.ok(reached,`stalled segment${i} at${JSON.stringify(body.translation())}, target${target}`);
 }
 assert.ok(maxRayGap<(speed<4?.2:.35),`unexpected terrain launch ${maxRayGap}`);
 const p=body.translation();for(let k=0;k<180;k++)tick(w,body);const q=body.translation(),drift=Math.hypot(p.x-q.x,p.z-q.z);assert.ok(drift<.1,`stopped drift${drift}`);t.diagnostic(JSON.stringify({steps,maxGap,maxRayGap,worst,drift,end:[q.x,q.y,q.z]}));w.free();});
test('jump on upper apron remains ballistic and returns to actual terrain',()=>{const {w,body}=fixture([[25,73,28]]);for(let i=0;i<90;i++)tick(w,body);const y=body.translation().y;tick(w,body,0,0,true);let peak=y;for(let i=0;i<120;i++){tick(w,body);peak=Math.max(peak,body.translation().y);}assert.ok(peak-y>.8&&peak-y<1.15);assert.ok(Math.abs(body.translation().y-y)<.04);w.free();});
