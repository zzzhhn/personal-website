// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-geometry.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Ray, Vector3 } from 'three';
import { buildDjcClubGeometry, buildDjcMirrorGeometry, buildDjcSpotsGeometry } from './WorldDjcClubGeometry.ts';
import { CLUB } from './djc-club-layout.ts';

const club=buildDjcClubGeometry(),mirror=buildDjcMirrorGeometry(),spots=buildDjcSpotsGeometry();
const all=[...Object.values(club.batches),club.pool,mirror,spots];
const triangles=g=>(g.index?.count??g.getAttribute('position').count)/3;
const total=all.reduce((n,g)=>n+triangles(g),0);
/** Barycentric vertical ray against the exact runtime support faces. */
function heightAt(x,z) {
  const p=club.colliders.surface.vertices;let highest=-Infinity;
  for(let i=0;i<p.length;i+=9) {
    const ax=p[i],ay=p[i+1],az=p[i+2],bx=p[i+3],by=p[i+4],bz=p[i+5],cx=p[i+6],cy=p[i+7],cz=p[i+8];
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-10)continue;
    const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,c=1-a-b;
    if(Math.min(a,b,c)>=-1e-6)highest=Math.max(highest,a*ay+b*by+c*cy);
  }
  return highest;
}
test('geometry remains within one medium venue and a 60k triangle / 12 static draw budget',()=>{
  assert.ok(total<60000,`triangles=${total}`);assert.ok(Object.keys(club.batches).length+1<=12);
  for(const g of all)for(const attr of Object.values(g.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v));
  for(const g of Object.values(club.batches)) {
    g.computeBoundingBox();const b=g.boundingBox;assert.ok(b.min.x>=23&&b.max.x<=74);assert.ok(b.min.z>=34&&b.max.z<=76);assert.ok(b.min.y>=.5&&b.max.y<=13);
  }
});
test('every support triangle faces upward with a walkable slope',()=>{
  const p=club.colliders.surface.vertices;
  for(let i=0;i<p.length;i+=9) {
    const ax=p[i+3]-p[i],ay=p[i+4]-p[i+1],az=p[i+5]-p[i+2],bx=p[i+6]-p[i],by=p[i+7]-p[i+1],bz=p[i+8]-p[i+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    assert.ok(ny>0,`support winding ${i/9}`);assert.ok(Math.hypot(nx,nz)/ny<.5,`slope ${i/9}`);
  }
});
test('mirror tiles face outward and remain visible with front-face culling',()=>{
  const p=mirror.getAttribute('position'),n=mirror.getAttribute('normal');
  for(let i=0;i<p.count;i++)assert.ok(p.getX(i)*n.getX(i)+p.getY(i)*n.getY(i)+p.getZ(i)*n.getZ(i)>0);
});
test('dance floor, stage and entrance ramp share their rendered top heights',()=>{
  assert.ok(Math.abs(heightAt(41,55)-CLUB.dance[1])<1e-5);assert.ok(Math.abs(heightAt(30,55)-CLUB.stage[1])<1e-5);
  for(let z=41.2;z<47.9;z+=.25)assert.ok(Math.abs(heightAt(31,z)-(1.01+(z-41)/7*(CLUB.stage[1]-1.01)))<1e-5);
});
test('two broad routes reach the sea side without a vertical step',()=>{
  for(const z of [45.2,64.8]) {
    let previous=heightAt(41,z);assert.ok(Number.isFinite(previous));
    for(let x=41.2;x<=68.8;x+=.2){const y=heightAt(x,z);assert.ok(Number.isFinite(y),`exit x=${x},z=${z}`);assert.ok(Math.abs(y-previous)<.25);previous=y;}
  }
});
test('pool has no collider at its central water surface, and both shallow slopes lead out',()=>{
  assert.ok(Math.abs(heightAt(57,55)-1.015)<1e-5, 'support is the visible pool bottom, below its water');
  for(const sign of [-1,1])for(let t=0;t<=1;t+=.05) {
    const z=55+sign*(4.5+3.5*t);assert.ok(Math.abs(heightAt(57,z)-Math.max(1.015,1.01+.35*t))<1e-4);
  }
  assert.ok(Math.abs(club.pool.getAttribute('position').getY(0)-CLUB.pool[1])<1e-5);
  assert.ok(CLUB.dance[0]+CLUB.danceRadii[0]<CLUB.pool[0]-CLUB.poolRadii[0]);
});
test('all collider indices are valid and all source surfaces match a visible triangle',()=>{
  for(const c of Object.values(club.colliders))for(const i of c.indices)assert.ok(i>=0&&i<c.vertices.length/3);
  const visible=new Set();
  const key=(p,i)=>Array.from(p.slice(i,i+9)).map(v=>v.toFixed(4)).join(',');
  for(const g of Object.values(club.batches)){const p=g.getAttribute('position').array;for(let i=0;i<p.length;i+=9)visible.add(key(p,i));}
  for(const [kind,c] of Object.entries(club.colliders)){const p=c.vertices;for(let i=0;i<p.length;i+=9)assert.ok(visible.has(key(p,i)),`${kind} triangle ${i/9}`);}
});
test('closed roof shell and bounded main bamboo guards share their visual triangles with solid',()=>{
  const solid=new Set(),p=club.colliders.solid.vertices;
  const key=(p,i)=>Array.from(p.slice(i,i+9)).map(v=>v.toFixed(4)).join(',');
  for(let i=0;i<p.length;i+=9)solid.add(key(p,i));
  let shell=0,structure=0;
  for(const [batch,colors] of [['fabric',['#b29153','#947a44','#99783f']],['wood',['#c29952','#bd9651','#846236','#98713f']]]) {
    const g=club.batches[batch],points=g.getAttribute('position').array,col=g.getAttribute('color'),targets=colors.map(c=>new Color(c));
    for(let i=0;i<col.count;i+=3)if(targets.some(c=>Math.abs(col.getX(i)-c.r)+Math.abs(col.getY(i)-c.g)+Math.abs(col.getZ(i)-c.b)<1e-5)) {
      assert.ok(solid.has(key(points,i*3)),`${batch} guard triangle ${i/3}`);if(batch==='fabric')shell++;else structure++;
    }
  }
  assert.equal(shell,1504);assert.equal(structure,2752);assert.ok(club.colliders.solid.indices.length/3<10000);
});
test('camera rays hit the roof underside and outer face with front-face culling',()=>{
  const p=club.colliders.solid.vertices,a=new Vector3(),b=new Vector3(),c=new Vector3(),hit=new Vector3();
  const roofY=7.3+3.6*(1-Math.pow(Math.abs(42.2-55)/13.2,1.65))+.025*(31-26);
  for(const [origin,direction,expected] of [[new Vector3(31,4,42.2),new Vector3(0,1,0),roofY-.15],[new Vector3(31,13,42.2),new Vector3(0,-1,0),roofY]]) {
    const ray=new Ray(origin,direction);let distance=Infinity,y=NaN;
    for(let i=0;i<p.length;i+=9)if(ray.intersectTriangle(a.fromArray(p,i),b.fromArray(p,i+3),c.fromArray(p,i+6),true,hit)){const d=origin.distanceTo(hit);if(d<distance){distance=d;y=hit.y;}}
    assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-expected)<.03,`roof guard y=${y}, expected ${expected}`);
  }
});
after(()=>{
  console.log(JSON.stringify({triangles:total,staticDraws:9,dynamicDraws:2,realLights:2,supportTriangles:club.colliders.surface.indices.length/3,solidTriangles:club.colliders.solid.indices.length/3,seats:club.seats.length}));
  all.forEach(g=>g.dispose());
});
