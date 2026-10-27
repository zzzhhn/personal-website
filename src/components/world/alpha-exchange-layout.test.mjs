import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { ALPHA_EXCHANGE_APPROACH, ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_FOOTPRINT, EXCHANGE_STATIONS,EXCHANGE_COLUMNS, EXCHANGE_WALK_PATHS, EXCHANGE_OUTER_ROUTES,exchangeCapeDistance,exchangePlatformSlabs } from './alpha-exchange-layout.ts';
import { BOARDWALK_POINTS,BOARDWALK_WIDTH } from './layout.ts';
import { playerSupport,followPlayerGround } from './player-ground.ts';
import { createPlayerClearance,sweptPlayerVelocity,playerVelocityChange } from './player-motion.ts';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { terrainHeight, effectiveCoastFrame } from './WorldLandform.ts';
const geometry=buildAlphaExchangeGeometry();
await R.init();
const parkQuad=()=>{const[a,b]=BOARDWALK_POINTS,dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz),n=[-dz/l,dx/l];return[[a,-1],[b,-1],[b,1],[a,1]].map(([p,s])=>[p[0]-ALPHA_EXCHANGE_ORIGIN[0]+n[0]*s*BOARDWALK_WIDTH/2,p[2]-ALPHA_EXCHANGE_ORIGIN[2]+n[1]*s*BOARDWALK_WIDTH/2]);};
function parkSupport(w){
  // This joint lies inside the real park strip, far from either end mitre.
  const vertices=parkQuad().flatMap(([x,z])=>[x,0,z]),body=w.createRigidBody(R.RigidBodyDesc.fixed());body.userData={surface:true,assetId:'park-deck'};
  return w.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array([0,2,1,0,3,2])).setFriction(.9),body);
}
test('the pavilion and approach have continuous real support and full standing-capsule clearance',()=>{
  const w=new R.World({x:0,y:-12.5,z:0}),surface=new Set(),ids=new Map();
  for(const [kind,mesh]of Object.entries(geometry.colliders)){
    const body=w.createRigidBody(R.RigidBodyDesc.fixed());
    const c=w.createCollider(R.ColliderDesc.trimesh(mesh.vertices,mesh.indices),body);if(kind==='surface')surface.add(c.handle);ids.set(c.handle,kind);
  }
  const park=parkSupport(w);surface.add(park.handle);ids.set(park.handle,'park-support');w.step();
  let checked=0;
  const point=p=>{
    const hit=w.castRayAndGetNormal(new R.Ray({x:p[0],y:p[1]+.4,z:p[2]},{x:0,y:-1,z:0}),.8,true,undefined,undefined,undefined,undefined,c=>surface.has(c.handle));
    assert.ok(hit&&Math.abs(hit.timeOfImpact-.4)<.005&&hit.normal.y>.99,`unsupported ${p}`);
    const blockers=[];w.intersectionsWithShape({x:p[0],y:p[1]+.88,z:p[2]},{x:0,y:0,z:0,w:1},new R.Capsule(.48,.34),c=>{if(!surface.has(c.handle))blockers.push(ids.get(c.handle));return true;});
    assert.deepEqual(blockers,[],`blocked ${p}`);checked++;
  };
  const approach=ALPHA_EXCHANGE_APPROACH.map(p=>p.map((v,i)=>v-ALPHA_EXCHANGE_ORIGIN[i]));
  for(const path of [...EXCHANGE_WALK_PATHS,approach])for(let k=1;k<path.length;k++){
    const a=path[k-1],b=path[k],n=Math.ceil(Math.hypot(...b.map((v,i)=>v-a[i]))/.2);
    for(let i=0;i<=n;i++)point(a.map((v,k)=>v+(b[k]-v)*i/n));
  }
  for(const s of EXCHANGE_STATIONS)point(s.stand);
  assert.ok(checked>150);w.free();
});
test('high hall, roof camera guard and three thick trading posts have bounded finite same-source geometry',()=>{
  const all=[geometry.body,geometry.glass],triangles=all.reduce((s,g)=>s+g.getAttribute('position').count/3,0);
  assert.ok(triangles<65000);assert.ok(geometry.body.boundingBox.max.y>11.5);
  const visible=new Set(),key=(p,i)=>Array.from(p.slice(i,i+9)).map(x=>x.toFixed(4)).join(',');
  for(const g of all){const p=g.getAttribute('position').array;for(const a of Object.values(g.attributes))for(const x of a.array)assert.ok(Number.isFinite(x));for(let i=0;i<p.length;i+=9)visible.add(key(p,i));}
  for(const mesh of Object.values(geometry.colliders))for(let i=0;i<mesh.vertices.length;i+=9)assert.ok(visible.has(key(mesh.vertices,i)));
  assert.ok(geometry.colliders.solid.indices.length/3<20000);
  console.log(JSON.stringify({triangles,staticDraws:3,lights:2,surface:geometry.colliders.surface.indices.length/3,solid:geometry.colliders.solid.indices.length/3}));
});
test('mezzanine ramp has real support, open landing and full capsule clearance; skylights stop camera casts',()=>{
  const w=new R.World({x:0,y:-12.5,z:0}),surface=new Set();
  for(const [kind,m]of Object.entries(geometry.colliders)){const c=w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices),w.createRigidBody(R.RigidBodyDesc.fixed()));if(kind==='surface')surface.add(c.handle);}w.step();
  for(let i=1;i<=50;i++) {
    const t=i/50,x=-10,z=-14-10.3*t,y=4.4*t;
    const hit=w.castRayAndGetNormal(new R.Ray({x,y:y+.4,z},{x:0,y:-1,z:0}),.8,true,undefined,undefined,undefined,undefined,c=>surface.has(c.handle));
    assert.ok(hit&&Math.abs(hit.timeOfImpact-.4)<.005&&hit.normal.y>.9);
    const blocked=[];w.intersectionsWithShape({x,y:y+.88,z},{x:0,y:0,z:0,w:1},new R.Capsule(.48,.34),c=>{if(!surface.has(c.handle))blocked.push(c.handle);return true;});assert.equal(blocked.length,0);
  }
  const roof=w.castRay(new R.Ray({x:3,y:8,z:-4.5},{x:0,y:1,z:0}),5,true,undefined,undefined,undefined,undefined,c=>!surface.has(c.handle));assert.ok(roof&&roof.timeOfImpact>3&&roof.timeOfImpact<4);
  w.free();
});
test('expanded hall has natural continuous earth, while the existing bridge and park entry stay intact',()=>{
  const f=ALPHA_EXCHANGE_FOOTPRINT;
  for(const x of [f.minX,f.maxX])for(const z of [f.minZ,f.maxZ])assert.ok(terrainHeight(x,z)>.99,`supported hall corner ${x},${z}`);
  for(const [x,z]of[[35,-43],[39,-43]])assert.equal(effectiveCoastFrame(x,z).height,effectiveCoastFrame(x,z).originalHeight);
  assert.ok(exchangeCapeDistance(60,-69)<0);assert.ok(exchangeCapeDistance(84,-69)>0);assert.deepEqual(ALPHA_EXCHANGE_ORIGIN,[60,1.14,-55]);
});
test('ground platforms and park strip have no positive-area coplanar overlaps',()=>{
  const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  const clip=(polygon,other)=>{let p=polygon;for(let i=0;i<other.length;i++){const a=other[i],b=other[(i+1)%other.length],out=[],side=v=>(b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]);for(let j=0;j<p.length;j++){const u=p[j],v=p[(j+1)%p.length],du=side(u),dv=side(v);if(du>=-1e-9)out.push(u);if((du>=0)!==(dv>=0)){const t=du/(du-dv);out.push([u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t]);}}p=out;if(p.length<3)return [];}return p;};
  const slabs=[...exchangePlatformSlabs(),{id:'existing-park',outline:parkQuad(),y:0}];
  for(let i=0;i<slabs.length;i++)for(let j=i+1;j<slabs.length;j++){const p=clip(slabs[i].outline,slabs[j].outline);assert.ok(p.length<3||area(p)<1e-7,`${slabs[i].id}/${slabs[j].id} overlap ${area(p)}`);}
});
test('production dynamic capsule crosses park/bridge/porch/floor and side landing seams in both directions',()=>{
  const a=ALPHA_EXCHANGE_APPROACH[0].map((v,i)=>v-ALPHA_EXCHANGE_ORIGIN[i]),length=Math.hypot(a[0],a[2]),d=[-a[0]/length,-a[2]/length],n=[-d[1],d[0]];
  for(const sideExit of [false,true])for(const direction of [-1,1])for(const offset of [-.8,.8]) {
    const w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
    for(const [kind,m]of Object.entries(geometry.colliders)){const b=w.createRigidBody(R.RigidBodyDesc.fixed());b.userData={[kind]:true};w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices).setFriction(.9),b);}parkSupport(w);
    const total=sideExit?4.6:length+.25,at=t=>sideExit?{x:10.1+t,z:-22+offset}:{x:a[0]+d[0]*t+n[0]*offset,z:a[2]+d[1]*t+n[1]*offset};
    const start=at(direction===1?0:total),unit=sideExit?[1,0]:d,body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(start.x,.88,start.z).lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
    w.createCollider(R.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min),body);const guard=createPlayerClearance(w);w.step();
    const tick=speed=>{const support=playerSupport(w,R,body),v=body.linvel(),change=playerVelocityChange(v,{x:unit[0]*direction*speed,y:0,z:unit[1]*direction*speed},1/60,!!support?.grounded);body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();};
    for(let i=0;i<45;i++)tick(0);let arrived=false,maxHeightError=0,lost=0;
    for(let i=0;i<300;i++){tick(3.6);const p=body.translation(),progress=(p.x-start.x)*unit[0]*direction+(p.z-start.z)*unit[1]*direction;maxHeightError=Math.max(maxHeightError,Math.abs(p.y-.82));if(!playerSupport(w,R,body)?.grounded)lost++;if(progress>=total){arrived=true;break;}}
    assert.ok(arrived,JSON.stringify({sideExit,direction,offset,p:body.translation()}));assert.ok(maxHeightError<.015&&lost<3,JSON.stringify({sideExit,direction,offset,maxHeightError,lost}));
    for(let i=0;i<90;i++)tick(0);assert.ok(playerSupport(w,R,body)?.grounded);w.removeCharacterController(guard);w.free();
  }
});
test('production dynamic capsule completes both outer aisles from entry to side exit and back',()=>{
  for(const [routeIndex,route]of EXCHANGE_OUTER_ROUTES.entries())for(const reverse of [false,true]) {
    const path=reverse?[...route].reverse():route,w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
    for(const [kind,m]of Object.entries(geometry.colliders)){const b=w.createRigidBody(R.RigidBodyDesc.fixed());b.userData={[kind]:true};w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices).setFriction(.9),b);}
    const start=path[0],body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(start[0],.88,start[2]).lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
    w.createCollider(R.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min),body);const guard=createPlayerClearance(w);w.step();
    const tick=(vx=0,vz=0)=>{const s=playerSupport(w,R,body),v=body.linvel(),d=playerVelocityChange(v,{x:vx,y:0,z:vz},1/60,!!s?.grounded);body.applyImpulse({x:d.x*body.mass(),y:0,z:d.z*body.mass()},true);body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();};
    for(let i=0;i<45;i++)tick();let checks=0;
    for(let k=1;k<path.length;k++){const target=path[k];let arrived=false;for(let i=0;i<900;i++){const p=body.translation(),dx=target[0]-p.x,dz=target[2]-p.z,d=Math.hypot(dx,dz);if(d<.07){arrived=true;break;}const speed=Math.min(3.6,d*4);tick(dx/d*speed,dz/d*speed);checks++;}
      assert.ok(arrived,JSON.stringify({routeIndex,reverse,leg:k,target,body:body.translation()}));for(let i=0;i<30;i++)tick();assert.ok(playerSupport(w,R,body)?.grounded);}
    console.log('outer aisle',JSON.stringify({routeIndex,reverse,steps:checks,final:body.translation()}));w.removeCharacterController(guard);w.free();
  }
});
test('column return leaves a real capsule-width aisle and preserves all trading anchors',()=>{
  const inside=Math.min(EXCHANGE_COLUMNS.x-EXCHANGE_COLUMNS.baseWidth/2,EXCHANGE_COLUMNS.x-EXCHANGE_COLUMNS.lowerDrumRadius),counterOutside=6.6+3.6+.6;
  assert.ok(inside-counterOutside>=.9);assert.ok(EXCHANGE_COLUMNS.x+EXCHANGE_COLUMNS.baseWidth/2<=13);
  assert.deepEqual(EXCHANGE_STATIONS.map(s=>[s.action,s.at,s.stand]),[
    ['buy',[-6.6,0,-5.4],[-6.6,0,-3.75]],['sell',[6.6,0,-5.4],[6.6,0,-3.75]],
    ['next',[-3,0,-9],[-1.45,0,-9]],['reset',[3,0,-9],[1.45,0,-9]],
  ]);
});
