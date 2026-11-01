import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { BufferGeometry,Float32BufferAttribute } from 'three';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { EXCHANGE_PLAY_STATIONS as S,EXCHANGE_PLAY_PROPS } from './alpha-exchange-play-layout.ts';
import { bakeExchangeWorklights } from './alpha-exchange-craft.ts';

await R.init();
test('furnished gallery keeps rear through-route, both landings and real selector hand access',()=>{
  const g=buildAlphaExchangeGeometry(),w=new R.World({x:0,y:-12.5,z:0}),surfaces=new Set();
  try {
    for(const [kind,m]of Object.entries(g.colliders)) {
      const c=w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices,m.flags));
      if(kind==='surface')surfaces.add(c.handle);
    }
    w.step();
    const samples=[];
    for(const z of [-37,-38.2])for(let x=-16;x<=16;x+=.25)samples.push([x,5.2,z]);
    for(const x of [-11.7,11.7])for(let z=-34.5;z>=-38;z-=.25)samples.push([x,5.2,z]);
    samples.push([...S.review.stand]);
    for(const [x,y,z]of samples) {
      const hits=[];
      w.intersectionsWithShape({x,y:y+.88,z},{x:0,y:0,z:0,w:1},new R.Capsule(.48,.34),c=>{
        if(!surfaces.has(c.handle))hits.push(c.handle);return true;
      });
      assert.deepEqual(hits,[],`standing capsule at ${x},${y},${z}`);
      assert.ok(w.castRay(new R.Ray({x,y:y+.2,z},{x:0,y:-1,z:0}),.3,true,
        undefined,undefined,undefined,c=>surfaces.has(c.handle)),`supported route ${x},${z}`);
    }
    const [x,y,z]=S.review.contact;
    assert.equal(w.castRay(new R.Ray({x,y,z:S.review.stand[2]},{x:0,y:0,z:-1}),S.review.stand[2]-z,true),null);
    const screen=EXCHANGE_PLAY_PROPS.review;
    const bottomZ=screen.display[2]-screen.displaySize[1]/2*Math.sin(screen.displayPitch);
    assert.ok(bottomZ<z-.15,'display is beyond the hand target rather than blocking the selector');
    // Real front panels, shelf sides and ceramic shells stop a player approaching.
    for(const [xx,yy,zz]of [[-12,5.8,-39.02],[12,5.8,-39.02],[-7.5,5.6,-38.7],[7.5,5.6,-38.7]]) {
      const hit=w.castRay(new R.Ray({x:xx,y:yy,z:-38.2},{x:0,y:0,z:-1}),1.6,true);
      assert.ok(hit&&hit.timeOfImpact<1.1,`actual visible furniture blocks approach at ${xx},${yy},${zz}`);
    }
  }finally{w.free();g.body.dispose();g.glass.dispose();}
});

test('rear lantern and shelf washes remain local, front-facing and night-only',()=>{
  const points=[[-6.15,3.3,-39.6,0,0,1],[-11.8,7.5,-39.3,0,0,1],
    [-6.15,.45,-39.6,0,1,0],[-11.8,5.2,-39.3,0,1,0],
    [-11.8,7.5,-39.3,0,0,-1],[0,3.3,-39.6,0,0,1],[-11.8,7.5,-37,0,0,1]];
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(points.flatMap(p=>p.slice(0,3)),3));
  g.setAttribute('normal',new Float32BufferAttribute(points.flatMap(p=>p.slice(3)),3));
  g.setAttribute('aEmit',new Float32BufferAttribute(new Float32Array(points.length*3),3));
  bakeExchangeWorklights(g);const e=g.getAttribute('aEmit');
  for(let i=0;i<2;i++){assert.ok(e.getY(i)>.15&&e.getY(i)<.5);assert.equal(e.getX(i),0);assert.equal(e.getZ(i),1);}
  for(let i=2;i<points.length;i++)assert.equal(e.getY(i),0);
  g.dispose();
});
