import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3, CatmullRomCurve3 } from 'three';
import { alphaTerrainData,alphaGroundHeight } from './alpha-terrain.ts';
import { ALPHA_SLED_PATH, ALPHA_MAIN_PATH } from './alpha-layout.ts';
import { batch2Segment } from './alpha-batch2-layout.ts';

test('actual terrain mesh supports the shallows banks and lodge footprint',()=>{
 const data=alphaTerrainData(),g=new BufferGeometry();
 g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));
 const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g,material),ray=new Raycaster();mesh.updateMatrixWorld();
 const height=(x,z)=>{ray.set(new Vector3(x,100,z),new Vector3(0,-1,0));return ray.intersectObject(mesh)[0]?.point.y;};
 try {
  // These are the visible planted-bank bases, including the former four-metre gap.
  for(let i=0;i<6;i++)for(const z of [-65.65,-54.35]){
   const x=-43.9+i*3.15,y=height(x,z);
   assert.ok(y>=11.7&&y<=12.25,`unsupported/buried bank at ${x},${z}: ${y}`);
  }
  for(const x of [-67.2,-64,-60.8])for(const z of [-42.6,-40,-37.4]){
   const y=height(x,z);assert.ok(y>=3.65&&y<=3.9,`lodge foundation at ${x},${z}: ${y}`);
  }
  assert.ok(height(-36,-60)<11.92,'stream bed must be below the water');
  for(let i=0;i<48;i++){
   const x=-84+(i*13.7)%168,z=-97+(i*27.3)%194;
   assert.ok(Math.abs(height(x,z)-alphaGroundHeight(x,z))<1e-5,'placement differs from rendered terrain');
  }
 } finally {g.dispose();material.dispose();}
});

test('curved sled swept corridor avoids lodge, shallows and arrival walk',()=>{
 const curve=new CatmullRomCurve3(ALPHA_SLED_PATH.map(p=>new Vector3(...p)),false,'centripetal');
 let lodge=Infinity,shallows=Infinity,walk=Infinity;
 for(let i=0;i<=1200;i++){
  const p=curve.getPointAt(i/1200);
  lodge=Math.min(lodge,Math.hypot(Math.max(0,Math.abs(p.x+64)-3.9),Math.max(0,Math.abs(p.z+40)-3.3)));
  shallows=Math.min(shallows,Math.hypot(Math.max(0,Math.abs(p.x+36)-9),Math.max(0,Math.abs(p.z+60)-6)));
  walk=Math.min(walk,batch2Segment(p.x,p.z,ALPHA_MAIN_PATH.slice(0,4)).distance);
 }
 assert.ok(lodge>2.5,`sled crosses lodge/roof footprint: ${lodge}`);
 assert.ok(shallows>6,`sled excavation reaches the shallows: ${shallows}`);
 assert.ok(walk>3,`arrival walk crosses sled corridor: ${walk}`);
});
