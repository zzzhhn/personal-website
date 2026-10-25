import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require=createRequire(import.meta.url);
const entry=require.resolve('@dimforge/rapier3d-compat',{paths:[require.resolve('@react-three/rapier')]});
const {default:RAPIER}=await import(entry); await RAPIER.init();
const assetRoot=process.env.ALPHA_MINE_TEST_ASSETS ? pathToFileURL(process.env.ALPHA_MINE_TEST_ASSETS.replace(/\/$/,'')+'/') : new URL('../../../public/world/alpha-mine/',import.meta.url);
const layout=JSON.parse(readFileSync(new URL('layout.json',assetRoot),'utf8'));
const proxies=JSON.parse(readFileSync(new URL('colliders.json',assetRoot),'utf8'));
function scene(){
 const world=new RAPIER.World({x:0,y:-12.5,z:0});
 const surface=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(proxies.surface.vertices),new Uint32Array(proxies.surface.indices)));
 const solid=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(proxies.solid.vertices),new Uint32Array(proxies.solid.indices)));
 world.step(); return {world,surface,solid};
}
test('authored mine route has continuous support and full capsule head/side clearance',()=>{
 const {world,surface,solid}=scene(), failures=[];let samples=0;
 try {
  for(let i=1;i<layout.route.points.length;i++){
   const a=layout.route.points[i-1],b=layout.route.points[i],n=Math.ceil(Math.hypot(...b.map((v,k)=>v-a[k]))/.22);
   for(let j=0;j<=n;j++){
    const p=a.map((v,k)=>v+(b[k]-v)*j/n), ray=new RAPIER.Ray({x:p[0],y:p[1]+.4,z:p[2]},{x:0,y:-1,z:0});
    const hit=world.castRayAndGetNormal(ray,.8,true,undefined,undefined,undefined,undefined,c=>c.handle===surface.handle);
    if(!hit||Math.abs(hit.timeOfImpact-.4)>.07||hit.normal.y<.9)failures.push({kind:'support',segment:i,p,toi:hit?.timeOfImpact,normal:hit?.normal});
    world.intersectionsWithShape({x:p[0],y:p[1]+.88,z:p[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.48,.34),c=>{if(c.handle===solid.handle)failures.push({kind:'clearance',segment:i,p});return true;});
    samples++;
   }
  }
  assert.equal(failures.length,0,JSON.stringify(failures.slice(0,12)));assert.ok(samples>250);
 }finally{world.free();}
});
test('mining stands occupy their stated storeys and seams are reachable from those stands',()=>{
 const {world,surface}=scene();
 try{for(const v of layout.veins){
  const p=v.stand,hit=world.castRay(new RAPIER.Ray({x:p[0],y:p[1]+.35,z:p[2]},{x:0,y:-1,z:0}),.7,true,undefined,undefined,undefined,undefined,c=>c.handle===surface.handle);
  assert.ok(hit,`${v.id}: no support`);assert.ok(Math.abs(hit.timeOfImpact-.35)<.08,`${v.id}: wrong level`);
  assert.ok(Math.hypot(v.socket[0]-p[0],v.socket[2]-p[2])<=1.3,`${v.id}: out of pickaxe reach`);
 }}finally{world.free();}
});

test('all mining and pickup approaches keep a clear chest ray and reachable capsule space',()=>{
 const {world,solid}=scene();
 try{for(const v of layout.veins){
  for(const [kind,target,distance] of [['strike',v.socket,1],['pickup',v.oreRest,.7]]){
   const p=[target[0],v.stand[1],target[2]+distance], chest={x:p[0],y:p[1]+1.27,z:p[2]};
   const dx=target[0]-chest.x,dy=target[1]+.2-chest.y,dz=target[2]-chest.z,len=Math.hypot(dx,dy,dz);
   const hit=world.castRay(new RAPIER.Ray(chest,{x:dx/len,y:dy/len,z:dz/len}),len-.3,true);
   assert.equal(hit,null,`${v.id} ${kind}: interaction blocked by geometry`);
   let blocked=false;world.intersectionsWithShape({x:p[0],y:p[1]+.88,z:p[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.48,.34),c=>{if(c.handle===solid.handle)blocked=true;return true;});
   assert.equal(blocked,false,`${v.id} ${kind}: capsule cannot reach the proposed stand`);
  }
 }}finally{world.free();}
});
