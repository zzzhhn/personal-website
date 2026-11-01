import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { BufferGeometry,Float32BufferAttribute } from 'three';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { EXCHANGE_ARCHIVE_DRAWERS } from './alpha-exchange-play-layout.ts';
import { bakeExchangeWorklights } from './alpha-exchange-craft.ts';

const geometry=buildAlphaExchangeGeometry();
await R.init();
const identity={x:0,y:0,z:0,w:1};
function withExchange(fn) {
  const world=new R.World({x:0,y:-12.5,z:0}),surfaces=new Set();
  try {
    for(const [kind,m]of Object.entries(geometry.colliders)) {
      const c=world.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices,m.flags));
      if(kind==='surface')surfaces.add(c.handle);
    }
    world.step();fn(world,surfaces);
  }finally{world.free();}
}

test('four anchored archive tickets have physical tray support and unobstructed hand contact',()=>withExchange((world,surfaces)=>{
  assert.equal(EXCHANGE_ARCHIVE_DRAWERS.length,4);
  for(const {stand,contact}of EXCHANGE_ARCHIVE_DRAWERS) {
    const [x,y,z]=contact;
    // Centre and both forward outer corners of the visible extension must be solid.
    for(const [dx,dz]of [[0,0],[-.29,.04],[.29,.04]]) {
      const hit=world.castRay(new R.Ray({x:x+dx,y:y+.2,z:z+dz},{x:0,y:-1,z:0}),.4,true);
      assert.ok(hit,`tray support at ${x+dx},${z+dz}`);
      assert.ok(Math.abs(y+.2-hit.timeOfImpact-(y-.015))<1e-5,'tray top directly supports the ticket');
    }
    const hand=world.castRay(new R.Ray({x,y,z:stand[2]},{x:0,y:0,z:-1}),stand[2]-z,true);
    assert.equal(hand,null,'hand can reach the ticket above the low front lip');
    const blocked=[];
    world.intersectionsWithShape({x:stand[0],y:stand[1]+.88,z:stand[2]},identity,new R.Capsule(.48,.34),c=>{
      if(!surfaces.has(c.handle))blocked.push(c.handle);return true;
    });
    assert.deepEqual(blocked,[],'standing capsule remains in front of the tray');
  }
}));

test('archive front aisle, right bypass and existing west ramp keep real capsule clearance',()=>withExchange((world,surfaces)=>{
  const samples=[];
  for(let i=0;i<=16;i++)samples.push([-14+i*.25,.45,-22.3]);
  for(let i=0;i<=16;i++)samples.push([-9.4,.45,-21-i*.25]);
  for(let i=0;i<=10;i++) {
    const z=-21-i*.5;samples.push([-15.7,.45+4.75*(-8-z)/22,z]);
  }
  for(const [x,y,z]of samples) {
    const blocked=[];
    world.intersectionsWithShape({x,y:y+.88,z},identity,new R.Capsule(.48,.34),c=>{
      if(!surfaces.has(c.handle))blocked.push(c.handle);return true;
    });
    assert.deepEqual(blocked,[],`open archive route ${x},${y},${z}`);
  }
}));

test('archive craft stays within a 4000-triangle local budget and the existing two static batches',()=>{
  const p=geometry.body.getAttribute('position');let triangles=0;
  const inArchive=i=>p.getX(i)>=-14.25001&&p.getX(i)<=-9.79999&&
    p.getY(i)>=.44999&&p.getY(i)<=4.50001&&p.getZ(i)>=-24.25001&&p.getZ(i)<=-22.64999;
  for(let i=0;i<p.count;i+=3)if([i,i+1,i+2].every(inArchive))triangles++;
  assert.ok(triangles>2000&&triangles<4000,`local archive triangles: ${triangles}`);
  assert.equal(Object.values(geometry).filter(v=>v?.isBufferGeometry).length,2);
  const visible=new Set(),key=(p,i)=>Array.from(p.slice(i,i+9)).map(x=>x.toFixed(5)).join(',');
  for(const g of [geometry.body,geometry.glass]) {
    for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
    const a=g.getAttribute('position').array;for(let i=0;i<a.length;i+=9)visible.add(key(a,i));
  }
  for(const m of Object.values(geometry.colliders))for(let i=0;i<m.vertices.length;i+=9)
    assert.ok(visible.has(key(m.vertices,i)),'solid extensions use the same visible triangles');
});

test('archive night bake reaches drawer faces and ticket trays without lighting floor, backs, lamps or side routes',()=>{
  const points=[
    [-13.1,2,-23.13,0,0,1],[-13.56,1.465,-22.86,0,1,0],
    [-13.56,.45,-22.86,0,1,0],[-13.1,2,-24.13,0,0,1],
    [-13.1,3.424,-22.96,0,-1,0],[-9.4,2,-23,0,0,1],
    [-14.4,2,-23,0,0,1],[-13.1,2,-23.13,0,0,-1],
    [-13.1,2,-22.6,0,1,0],[-13.1,3.36,-23.13,0,0,1],
    [-13.1,2,-23.13,1,0,0],
  ];
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(points.flatMap(p=>p.slice(0,3)),3));
  g.setAttribute('normal',new Float32BufferAttribute(points.flatMap(p=>p.slice(3)),3));
  g.setAttribute('aEmit',new Float32BufferAttribute(new Float32Array(points.length*3),3));
  bakeExchangeWorklights(g);const e=g.getAttribute('aEmit');
  for(let i=0;i<2;i++) {
    assert.ok(e.getY(i)>.15&&e.getY(i)<1);assert.equal(e.getX(i),0,'day emission stays unchanged');
    assert.equal(e.getZ(i),1,'shared warm night tint');
  }
  for(let i=2;i<points.length;i++)assert.equal(e.getY(i),0,`bounded archive light sample ${i}`);
  g.dispose();
});
