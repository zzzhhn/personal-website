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

test('interpolated cable hull has clearance through the full upper approach',async()=>{
 const {CatmullRomCurve3,Vector3}=await import('three');
 const curve=new CatmullRomCurve3(ALPHA_CABLE_PATH.map(p=>new Vector3(...p)),false,'centripetal');
 let min=Infinity;
 for(let i=80;i<=940;i++){const u=i/1000,p=curve.getPointAt(u),t=curve.getTangentAt(u);p.y=Math.max(38,Math.min(73,p.y));const len=Math.hypot(t.x,t.z),nx=-t.z/len,nz=t.x/len;
 for(const across of [-1.2,0,1.2])for(const along of [-1.6,0,1.6]){const x=p.x+nx*across+t.x/len*along,z=p.z+nz*across+t.z/len*along;
 const gap=p.y-alphaHeight(x,z);min=Math.min(min,gap);assert.ok(gap>-.06,`hull u=${u} across=${across} along=${along} gap=${gap}`);}
 }
 assert.ok(min>-.06);
});

test('interpolated pitched sled runner hull clears terrain at side and nose corners',async()=>{
 const {CatmullRomCurve3,Vector3,Quaternion}=await import('three');
 const curve=new CatmullRomCurve3(ALPHA_SLED_PATH.map(p=>new Vector3(p[0],p[1]+.16,p[2])),false,'centripetal');
 for(let i=70;i<=940;i++){const u=i/1000,p=curve.getPointAt(u),t=curve.getTangentAt(u).normalize();p.y=Math.max(3.96,Math.min(76.16,p.y));const q=new Quaternion().setFromUnitVectors(new Vector3(1,0,0),t);
 for(const x of [-1.2,0,1.42])for(const z of [-.545,0,.545]){const v=new Vector3(x,-.16,z).applyQuaternion(q).add(p),gap=v.y-alphaHeight(v.x,v.z);assert.ok(gap>-.03,`sled u=${u} x=${x} z=${z} gap=${gap}`);}
 }
});
