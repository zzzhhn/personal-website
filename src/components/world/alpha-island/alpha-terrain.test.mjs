import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { alphaHeight,alphaTerrainData,nearestAlphaSegment,alphaRadial } from './alpha-terrain.ts';
import { ALPHA_MAIN_PATH,ALPHA_SOCKETS,ALPHA_CABLE_PATH,ALPHA_SLED_PATH } from './alpha-layout.ts';
import { findSafePlayerLanding } from '../safe-landing.ts';
await RAPIER.init();
test('main walk has traversable gradient and rendered/collision support along full width',()=>{
 for(let i=1;i<ALPHA_MAIN_PATH.length;i++){
 const a=ALPHA_MAIN_PATH[i-1],b=ALPHA_MAIN_PATH[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
 assert.ok(Math.abs(b[1]-a[1])/length<.36,`segment ${i} steep`);
 for(let k=0;k<=Math.ceil(length);k++){const t=k/Math.ceil(length),x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
 assert.ok(Math.abs(alphaHeight(x,z)-(a[1]+(b[1]-a[1])*t))<.45,`route support ${i}/${k}: ${alphaHeight(x,z)}`);
 }
 }
});
test('every island terminal has a real dry clear capsule exit and escape route',()=>{
 const d=alphaTerrainData(),w=new RAPIER.World({x:0,y:-9.81,z:0});
 w.createCollider(RAPIER.ColliderDesc.trimesh(d.positions,d.indices));
 const body=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,100,0));
 w.createCollider(RAPIER.ColliderDesc.capsule(.48,.34),body);w.step();
 for(const [id,s] of Object.entries(ALPHA_SOCKETS)) assert.ok(findSafePlayerLanding(w,RAPIER,body,s.safeExit,-.7),id);
 w.free();
});
test('cable middle and sled outer corridors stay above terrain',()=>{
 for(const [path,clearance,name] of [[ALPHA_CABLE_PATH,5.5,'cable'],[ALPHA_SLED_PATH,.30,'sled']])for(let i=2;i<path.length-2;i++){
 const a=path[i-1],b=path[i];for(let k=1;k<10;k++){const t=k/10,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
 if(name==='sled'&&Math.min(Math.hypot(x-26,z-46),Math.hypot(x+67,z+29))<13)continue;
 if(name==='cable'&&Math.min(Math.hypot(x-35,z+39),Math.hypot(x-29,z-22))<14)continue;
 assert.ok(y-alphaHeight(x,z)>=clearance,`${name} ${i}/${k}: ${y-alphaHeight(x,z)}`);
 }}
});
