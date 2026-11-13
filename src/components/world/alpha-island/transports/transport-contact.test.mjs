import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationMixer, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { ALPHA_TRANSPORT_ROUTES,alphaFerryRoute } from './alpha-routes.ts';
import { sampleTransport, transportCurve, transportWorld } from '../../rides/transport-route.ts';
import { transportBoardingGeometry } from '../../rides/transport-boarding.ts';
import { settleGuideAttraction } from '../../WorldGuideAttraction.ts';
import { GuideSeatContact,holdGuideSeatIdle } from '../../WorldGuideSeat.ts';
import { GuideSlopeFit,skinnedWorldPoint } from '../../WorldGuideStop.ts';
import { loadGuide } from '../../../../../tools/world/guide/boot-analysis.mjs';
import { readWorldCraftGltf,disposeWorldCraftGltf } from '../../world-craft-gltf-test.mjs';
const routes=[...ALPHA_TRANSPORT_ROUTES,alphaFerryRoute()];
test('actual route interpolation remains within terminal elevations and transform endpoints',()=>{
 for(const route of routes){const c=transportCurve(route),lo=Math.min(...route.path.map(p=>p[1])),hi=Math.max(...route.path.map(p=>p[1]));for(let i=0;i<=1000;i++){const p=c.getPointAt(i/1000);assert.ok(p.y>=lo-1e-8&&p.y<=hi+1e-8);}
 for(const endpoint of [0,1])assert.deepEqual(sampleTransport(route,endpoint,c).vehicle,transportWorld(route.path[endpoint?route.path.length-1:0],route.transform));}
});
test('fixed gangway visible top, collision triangles and foot sampler share the same sloping surface',()=>{
 for(const route of routes)for(const index of [0,1]){const data=transportBoardingGeometry(route,index),g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g,material);mesh.updateMatrixWorld(true);
 for(let j=1;j<data.path.length;j++)for(const t of [.1,.4,.8]){const p=new Vector3(...data.path[j-1]).lerp(new Vector3(...data.path[j]),t);const hit=new Raycaster(p.clone().add(new Vector3(0,1,0)),new Vector3(0,-1,0),0,2).intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-data.support(p.x,p.z))<2e-5,JSON.stringify({route:route.id,index,j,t,p:p.toArray(),hit:hit.point.y,support:data.support(p.x,p.z)}));}
 g.dispose();material.dispose();}
});
test('fresh runtime GLBs support actual G24 buttock patch and both boots through full route orientation',async context=>{
 const {gltf:{scene,animations}}=await loadGuide(new URL('../../../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url)),parent=new Group(),root=new Group();parent.add(root);root.add(scene);const mixer=new AnimationMixer(scene);holdGuideSeatIdle(mixer.clipAction(animations.find(c=>c.name==='SitIdle'))).play();mixer.update(1);const contact=new GuideSeatContact(scene,animations),slope=new GuideSlopeFit(scene);let minimum=Infinity,samples=0;
 for(const route of routes){const asset=await readWorldCraftGltf([`public/assets/world/alpha-island/transports/${route.kind}.glb`]);assert.ok(asset);asset.scene.updateMatrixWorld(true);
 for(const u of [0,.2,.5,.8,1]){const sample=sampleTransport(route,u);settleGuideAttraction(root,contact,{root:sample.pose.seat,yaw:sample.yaw,speed:0,clip:'SitIdle',seatWeight:1,seat:sample.pose.seat,orientation:sample.orientation});const inverse=new Matrix4().compose(new Vector3(...sample.vehicle),new Quaternion(...sample.orientation),new Vector3(1,1,1)).invert();
 const butt=contact.sample(new Vector3()).applyMatrix4(inverse),seatHit=new Raycaster(butt.clone().add(new Vector3(0,.03,0)),new Vector3(0,-1,0),0,.08).intersectObject(asset.scene,true)[0];assert.ok(seatHit,route.kind+' actual seat patch');assert.ok(Math.abs(seatHit.point.y-butt.y)<.006,route.kind+' seat top matches contact');
 for(const leg of Object.values(slope.legs)){let min=Infinity;for(const p of leg.sole){const v=skinnedWorldPoint(p.mesh,p.index,new Vector3()).applyMatrix4(inverse);const hit=new Raycaster(v.clone().add(new Vector3(0,.02,0)),new Vector3(0,-1,0),0,.25).intersectObject(asset.scene,true)[0];assert.ok(hit,route.kind+' actual footrest under boot');min=Math.min(min,v.y-hit.point.y);samples++;}minimum=Math.min(minimum,min);assert.ok(min>=-.003&&min<.012,route.kind+' loaded boot patch supported');}
 }
 disposeWorldCraftGltf(asset.scene);}
 mixer.stopAllAction();context.diagnostic(`${samples} boot/physical-footrest samples; minimum=${minimum}m`);
});
test('SitDown and StandUp boots remain above their real boarding/footrest supports',async context=>{
 const {gltf:{scene,animations}}=await loadGuide(new URL('../../../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url)),parent=new Group(),root=new Group();parent.add(root);root.add(scene);const mixer=new AnimationMixer(scene),contact=new GuideSeatContact(scene,animations),slope=new GuideSlopeFit(scene);const {GuideAttractionFeet}=await import('../../WorldGuideAttraction.ts');const {registerRideGround}=await import('../../rides/ride-contract.ts');const feet=new GuideAttractionFeet();let min=Infinity,count=0;
 for(const route of routes)for(const endpoint of [0,1]){const support=transportBoardingGeometry(route,endpoint,()=>route.terminals[endpoint].vehicle[1]),cleanup=registerRideGround('contact-test',support.support),sample=sampleTransport(route,endpoint),inside=transportWorld(route.terminals[endpoint].boarding.at(-1),route.transform);
 for(const clip of ['SitDown','StandUp']){mixer.stopAllAction();const action=mixer.clipAction(animations.find(c=>c.name===clip)).reset().play();
 for(let i=0;i<=80;i++){feet.restore();const q=i/80,k=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};action.time=q*action.getClip().duration;mixer.update(0);const frame={root:inside,yaw:sample.yaw,speed:0,clip,seatWeight:clip==='SitDown'?k((q-.25)/.7):1-k(q/.75),seat:sample.pose.seat,orientation:sample.orientation,stairs:true,groundId:'contact-test'};settleGuideAttraction(root,contact,frame);feet.apply(slope,frame,1/60);root.updateWorldMatrix(true,true);
 for(const leg of Object.values(slope.legs))for(const p of leg.sole){const v=skinnedWorldPoint(p.mesh,p.index,new Vector3()),ground=support.support(v.x,v.z);if(ground!==null){min=Math.min(min,v.y-ground);count++;assert.ok(v.y-ground>=-.011,JSON.stringify({kind:route.kind,endpoint,clip,q,penetration:v.y-ground}));}}
 }feet.restore();}cleanup();}
 mixer.stopAllAction();context.diagnostic(`${count} SitDown/StandUp boot/support samples, minimum=${min}m`);
});
