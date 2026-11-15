import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3, CatmullRomCurve3 } from 'three';
import { alphaTerrainData,alphaGroundHeight } from './alpha-terrain.ts';
import { ALPHA_SLED_PATH, ALPHA_MAIN_PATH } from './alpha-layout.ts';
import { batch2Segment } from './alpha-batch2-layout.ts';

test('actual terrain mesh supports the coastal footpath and lodge footprint',()=>{
 const data=alphaTerrainData(),g=new BufferGeometry();
 g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));
 const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g,material),ray=new Raycaster();mesh.updateMatrixWorld();
 const height=(x,z)=>{ray.set(new Vector3(x,100,z),new Vector3(0,-1,0));return ray.intersectObject(mesh)[0]?.point.y;};
 try {
  // Removing the rune basin must retain continuous ground under the old crossing.
  for(let x=-44.75;x<=-27;x+=.5)for(const z of [-56.7,-56,-55.3]){
   const y=height(x,z);
   assert.ok(Math.abs(y-12)<.25,`unsupported coastal footpath at ${x},${z}: ${y}`);
   assert.ok(Math.abs(height(x+.25,z)-y)/.25<Math.tan(25*Math.PI/180),`coastal footpath exceeds walking slope at ${x},${z}`);
  }
  for(const x of [-67.2,-64,-60.8])for(const z of [-42.6,-40,-37.4]){
   const y=height(x,z);assert.ok(y>=3.65&&y<=3.9,`lodge foundation at ${x},${z}: ${y}`);
  }
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

test('waterfall passage fixed stone floor is not buried by the mountain triangles',()=>{
 for(let x=-31.8;x<=-19.8;x+=.5)for(let z=3.6;z<=6.2;z+=.5){
  assert.ok(alphaGroundHeight(x,z)<24.01,`terrain protrudes through passage at ${x},${z}`);
 }
});
