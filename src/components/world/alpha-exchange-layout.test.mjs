import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { ALPHA_EXCHANGE_APPROACH, ALPHA_EXCHANGE_ORIGIN, EXCHANGE_STATIONS, EXCHANGE_WALK_PATHS, exchangeBoxes } from './alpha-exchange-layout.ts';
await R.init();
test('the pavilion and approach have continuous real support and full standing-capsule clearance',()=>{
  const w=new R.World({x:0,y:-12.5,z:0}),surface=new Set(),ids=new Map();
  for(const b of exchangeBoxes()){
    const q=new Quaternion().setFromEuler(new Euler(...(b.rotation??[0,0,0])));
    const body=w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...b.center).setRotation(q));
    const c=w.createCollider(R.ColliderDesc.cuboid(...b.size.map(v=>v/2)),body);if(b.surface)surface.add(c.handle);ids.set(c.handle,b.id);
  }w.step();
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
