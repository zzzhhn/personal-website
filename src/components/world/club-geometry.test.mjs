// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-geometry.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Ray, Vector3 } from 'three';
import { buildDjcClubGeometry, buildDjcMirrorGeometry, buildDjcSpotsGeometry,DJC_CLUB_SEATS,DJC_DAYBED_TOP,DJC_MIRROR_RADIUS } from './WorldDjcClubGeometry.ts';
import { CLUB, CLUB_POOL, CLUB_DAYBEDS, CLUB_PALMS, CLUB_SOFT_PLANTS, clubScatterBlocked } from './djc-club-layout.ts';
import { CLUB_LIGHTS } from './WorldClubLighting.ts';
import { terrainHeight } from './WorldLandform.ts';

const club=buildDjcClubGeometry(),mirror=buildDjcMirrorGeometry(),spots=buildDjcSpotsGeometry();
const all=[...Object.values(club.batches),club.pool,mirror,spots];
const triangles=g=>(g.index?.count??g.getAttribute('position').count)/3;
const total=all.reduce((n,g)=>n+triangles(g),0);
const projectedArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2];},0))/2;
function flatFaces(g,y=1.4){
  const p=g.getAttribute('position'),result=[];
  for(let i=0;i<p.count;i+=3){const t=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)]);
    if(t.every(a=>Math.abs(a[1]-y)<1e-5)&&(t[1][2]-t[0][2])*(t[2][0]-t[0][0])-(t[1][0]-t[0][0])*(t[2][2]-t[0][2])>1e-9)result.push(t);}
  return result;
}
function intersectTriangles(subject,clip){
  let polygon=subject;
  for(let edge=0;edge<3;edge++){
    const a=clip[edge],b=clip[(edge+1)%3],distance=p=>(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]),result=[];
    for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=distance(p),dq=distance(q);if(dp<=0)result.push(p);if((dp<=0)!==(dq<=0)){const t=dp/(dp-dq);result.push(p.map((v,k)=>v+(q[k]-v)*t));}}
    polygon=result;
  }
  return polygon;
}
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
test('geometry remains within one medium venue and the 68k triangle / 12 static draw budget',()=>{
  assert.ok(total<68000,`triangles=${total}`);assert.ok(Object.keys(club.batches).length+1<=12);
  for(const g of all)for(const attr of Object.values(g.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v));
  for(const g of Object.values(club.batches)) {
    g.computeBoundingBox();const b=g.boundingBox;assert.ok(b.min.x>=21&&b.max.x<=100);assert.ok(b.min.z>=25&&b.max.z<=90);assert.ok(b.min.y>=.4&&b.max.y<=13);
  }
});
test('pool paving uses metre-scale inlaid joints with complete stone and wood union coverage',()=>{
  const g=club.batches.stone,p=g.getAttribute('position'),c=g.getAttribute('color'),palette=['#c3bba6','#c0b8a4','#c6bea9','#b4ad98'].map(c=>new Color(c));
  let area=0,count=0,joints=0;
  const triangleArea=(a,b,d)=>Math.abs((b[0]-a[0])*(d[1]-a[1])-(d[0]-a[0])*(b[1]-a[1]))/2;
  for(let i=0;i<p.count;i+=3){
    const color=palette.findIndex(t=>Math.abs(c.getX(i)-t.r)+Math.abs(c.getY(i)-t.g)+Math.abs(c.getZ(i)-t.b)<1e-5);if(color<0)continue;
    const x=[p.getX(i),p.getX(i+1),p.getX(i+2)],z=[p.getZ(i),p.getZ(i+1),p.getZ(i+2)];
    assert.ok(Math.max(...x)-Math.min(...x)<=1.80002);assert.ok(Math.max(...z)-Math.min(...z)<=1.25002);
    area+=triangleArea([x[0],z[0]],[x[1],z[1]],[x[2],z[2]]);count++;if(color===3)joints++;
  }
  let expected=0,woodInlay=0;const wood=flatFaces(club.batches.wood);
  for(let i=0;i<CLUB_POOL.segments;i++){
    const a=i*Math.PI*2/CLUB_POOL.segments,b=(i+1)*Math.PI*2/CLUB_POOL.segments,mid=(a+b)/2,w=2.8+.45*Math.sin(mid*4+.4),coping=(Math.abs(Math.cos(mid))<.22||Math.abs(Math.sin(mid))<.28)?1.35:.52;
    for(const [inner,outer]of [[coping,w],[w,w+2.4]]){
      const q=[CLUB_POOL.boundary(a,inner),CLUB_POOL.boundary(a,outer),CLUB_POOL.boundary(b,outer),CLUB_POOL.boundary(b,inner)];
      expected+=triangleArea(q[0],q[2],q[1])+triangleArea(q[0],q[3],q[2]);
      if(inner===coping)for(const t of [[q[0],q[2],q[1]],[q[0],q[3],q[2]]])for(const w of wood)woodInlay+=projectedArea(intersectTriangles(t.map(([x,z])=>[x,1.4,z]),w));
    }
  }
  assert.ok(count>3000&&joints>1000,'visible fixed-scale stone and grout subdivisions');
  assert.ok(woodInlay>1,'the wooden approaches intersect the paving');
  assert.ok(Math.abs(area+woodInlay-expected)<.02,`stone=${area}, wood inlay=${woodInlay}, original=${expected}`);
});
test('both flush wooden approaches have no positive-area coplanar overlap with stone',()=>{
  const wood=flatFaces(club.batches.wood),stone=flatFaces(club.batches.stone);let overlap=0;
  assert.ok(wood.length>=2,'both approaches retain a horizontal terminal');
  for(const sign of [-1,1])assert.ok(wood.some(t=>sign*(t.reduce((s,p)=>s+p[2],0)/3-55)>0));
  for(const w of wood)for(const s of stone)overlap+=projectedArea(intersectTriangles(w,s));
  assert.ok(overlap<.0001,`coplanar wood/stone overlap=${overlap} square metres`);
  // Cross both seams, including the original gentle timber approach grade.
  for(const sign of [-1,1]){
    const end=CLUB_POOL.boundary(sign*2.12,1.6),dx=end[0]-41,dz=end[1]-(55+sign*9),length=Math.hypot(dx,dz);
    const from=[end[0]-.7*dx/length,end[1]-.7*dz/length],to=[end[0]+.7*dx/length,end[1]+.7*dz/length];
    let previous=heightAt(...from);
    for(let i=0;i<=50;i++){
      const t=i/50,y=heightAt(from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t);
      assert.ok(y>=1.3999&&y<=1.6,`junction support=${y}`);assert.ok(Math.abs(y-previous)<.03,'no missing support or vertical seam');previous=y;
    }
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
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))-DJC_MIRROR_RADIUS)<1e-6);
});
test('registered daybed datums agree with the cushion support and all front ramps reach them',()=>{
  for(const s of DJC_CLUB_SEATS){assert.ok(Math.abs(heightAt(s.position[0],s.position[2])-s.position[1])<1e-5);assert.equal(s.yaw,Math.PI/2);assert.equal(s.position[1],DJC_DAYBED_TOP);}
  for(const {from,to,width}of club.daybedApproaches){assert.ok(width>=1.5);let previous=heightAt(from[0],from[2]);for(let i=1;i<=60;i++){const t=i/60,x=from[0]+(to[0]-from[0])*t,z=from[2]+(to[2]-from[2])*t,y=heightAt(x,z);assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-previous)<.2);previous=y;}assert.ok(Math.abs(previous-DJC_DAYBED_TOP)<1e-4);}
});
test('dance floor, stage and entrance ramp share their rendered top heights',()=>{
  assert.ok(Math.abs(heightAt(41,55)-CLUB.dance[1])<1e-5);assert.ok(Math.abs(heightAt(30,55)-CLUB.stage[1])<1e-5);
  for(let z=41.2;z<47.9;z+=.25)assert.ok(Math.abs(heightAt(31,z)-(1.01+(z-41)/7*(CLUB.stage[1]-1.01)))<1e-5);
});
test('two broad routes reach the sea side without a vertical step',()=>{
  for(const sign of [-1,1]) {
    const start=[41,55+sign*9],end=CLUB_POOL.boundary(sign*2.12,1.6);let previous=heightAt(...start);
    for(let i=1;i<=50;i++){const t=i/50,x=start[0]+(end[0]-start[0])*t,z=start[1]+(end[1]-start[1])*t,y=heightAt(x,z);assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-previous)<.2);previous=y;}
    for(let i=1;i<=50;i++){const [x,z]=CLUB_POOL.boundary(sign*(2.12-1.52*i/50),1.6),y=heightAt(x,z);assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-previous)<.2);previous=y;}
  }
});
test('pool has no collider at its central water surface, and four shallow slopes lead out',()=>{
  assert.ok(Math.abs(heightAt(CLUB.pool[0],CLUB.pool[2])-CLUB_POOL.floorHeight(CLUB.pool[0],CLUB.pool[2]))<1e-4);
  assert.ok(heightAt(CLUB.pool[0],CLUB.pool[2])<CLUB_POOL.waterY-.7);
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(let t=0;t<=1;t+=.05) {
    const [x,z]=CLUB_POOL.boundary(angle,t*1.35);assert.ok(Math.abs(heightAt(x,z)-(1+.43*t))<.035);
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
  assert.equal(shell,1504);assert.equal(structure,2752);assert.ok(club.colliders.solid.indices.length/3<18000);
});
test('rounded eave caps have matching camera guards and bamboo collars follow the arch tangent',()=>{
  const g=club.batches.wood,p=g.getAttribute('position'),c=g.getAttribute('color'),n=g.getAttribute('normal'),cap=new Color('#98753f'),node=new Color('#745833');
  const key=(p,i)=>Array.from(p.slice(i,i+9)).map(v=>v.toFixed(4)).join(','),solid=new Set();
  for(let i=0;i<club.colliders.solid.vertices.length;i+=9)solid.add(key(club.colliders.solid.vertices,i));
  let caps=0,nodes=0;
  for(let i=0;i<p.count;i+=3){
    const matches=t=>Math.abs(c.getX(i)-t.r)+Math.abs(c.getY(i)-t.g)+Math.abs(c.getZ(i)-t.b)<1e-5;
    if(matches(cap)){assert.ok(solid.has(key(p.array,i*3)));caps++;}
    if(matches(node)&&Math.abs(n.getX(i))<1e-4&&Math.abs(n.getY(i))>.2&&Math.abs(n.getZ(i))>.2)nodes++;
  }
  assert.equal(caps,2*28*32);assert.ok(nodes>100,'collar end faces turn with the curved bamboo rather than staying horizontal');
});
test('freeform basin, solid daybeds and full palm trunks keep their physical contract',()=>{
  const area=CLUB_POOL.outline.reduce((s,p,i)=>{const q=CLUB_POOL.outline[(i+1)%CLUB_POOL.segments];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
  assert.ok(area>2.5*Math.PI*10.5*14.2,'water area exceeds 2.5 times the previous pool');
  assert.ok(triangles(club.pool)<=2304,'bounded surface grid keeps the venue below its existing triangle budget');
  const waterPositions=club.pool.getAttribute('position');let surfaceArea=0;
  for(let i=0;i<waterPositions.count;i+=3){
    const a=new Vector3().fromBufferAttribute(waterPositions,i),b=new Vector3().fromBufferAttribute(waterPositions,i+1),c=new Vector3().fromBufferAttribute(waterPositions,i+2);
    const cross=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(cross.y>0,'all water triangles face up');
    surfaceArea+=cross.length()/2;
    assert.ok(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))<3,'long waves are spatially resolved');
  }
  assert.ok(Math.abs(surfaceArea-area)<.01,'subdivision preserves the existing freeform waterline');
  for(const [x,z] of CLUB_DAYBEDS)assert.ok(Math.abs(heightAt(x,z)-1.755)<.001,'seat pad has same-mesh support');
  const g=club.batches.wood,p=g.getAttribute('position').array,col=g.getAttribute('color'),targets=['#74634a','#857251'].map(c=>new Color(c));
  const key=(p,i)=>Array.from(p.slice(i,i+9)).map(v=>v.toFixed(4)).join(',');const solid=new Set(),s=club.colliders.solid.vertices;
  for(let i=0;i<s.length;i+=9)solid.add(key(s,i));let trunks=0;
  for(let i=0;i<col.count;i+=3)if(targets.some(c=>Math.abs(col.getX(i)-c.r)+Math.abs(col.getY(i)-c.g)+Math.abs(col.getZ(i)-c.b)<1e-5)){assert.ok(solid.has(key(p,i*3)));trunks++;}
  assert.equal(trunks,6*7*32);
  const mask=club.batches.foliage.getAttribute('aClubWind').array;assert.ok(Math.min(...mask)===0);assert.ok(Math.max(...mask)>.5);
});
test('six palm crowns have separated small folded leaflets with fixed crown roots and moving tips',()=>{
  const g=club.batches.foliage,p=g.getAttribute('position'),wind=g.getAttribute('aClubWind'),a=new Vector3(),b=new Vector3(),c=new Vector3();
  const counts=CLUB_PALMS.map(()=>0),roots=CLUB_PALMS.map(()=>0),tips=CLUB_PALMS.map(()=>0);
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const area=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;assert.ok(area>1e-7,'no collapsed leaf triangles');
    if(a.y<4)continue;
    const palm=CLUB_PALMS.findIndex(([x,z,h,phase])=>Math.hypot(a.x-x-.6*Math.sin(phase),a.z-z-.6*Math.cos(phase))<3.3&&Math.abs(a.y-terrainHeight(x,z)-h)<2.2);
    assert.ok(palm>=0);counts[palm]++;assert.ok(area<.08,'crown is split into narrow blades rather than a solid fan');
    for(let j=i;j<i+3;j++){
      const [x,z,h,phase]=CLUB_PALMS[palm],distance=Math.hypot(p.getX(j)-x-.6*Math.sin(phase),p.getY(j)-terrainHeight(x,z)-h,p.getZ(j)-z-.6*Math.cos(phase));
      if(distance<.001){assert.equal(wind.getX(j),0);roots[palm]++;}
      if(distance>2.3&&wind.getX(j)>.4)tips[palm]++;
    }
  }
  for(let i=0;i<6;i++){assert.ok(counts[i]>800);assert.ok(roots[i]>=9);assert.ok(tips[i]>10);}
});
test('eight planted islands have layered terrain-rooted soft leaves clear of circulation',()=>{
  const g=club.batches.foliage,p=g.getAttribute('position'),wind=g.getAttribute('aClubWind'),colors=g.getAttribute('color');
  const broad=['#547956','#71905d'].map(c=>new Color(c)),fine=new Color('#87945e'),groups=CLUB_SOFT_PLANTS.map(()=>({broad:0,fine:0,root:0,low:0,high:0}));
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>4)continue;
    assert.equal(clubScatterBlocked(x,z),false,'soft leaves retain the paving and approach clearance');
    assert.ok(y>=terrainHeight(x,z)-.001,'soft leaves do not emerge from below or float above their sampled root');
    let nearest=0;for(let j=1;j<groups.length;j++)if(Math.hypot(x-CLUB_SOFT_PLANTS[j][0],z-CLUB_SOFT_PLANTS[j][1])<Math.hypot(x-CLUB_SOFT_PLANTS[nearest][0],z-CLUB_SOFT_PLANTS[nearest][1]))nearest=j;
    const match=c=>Math.abs(colors.getX(i)-c.r)+Math.abs(colors.getY(i)-c.g)+Math.abs(colors.getZ(i)-c.b)<1e-5,group=groups[nearest],height=y-terrainHeight(x,z);
    if(broad.some(match))group.broad++;if(match(fine))group.fine++;
    if(height<.02&&wind.getX(i)===0)group.root++;if(height>.25&&height<.65)group.low++;if(height>1.1)group.high++;
  }
  for(const group of groups){assert.ok(group.broad>100&&group.fine>50);assert.ok(group.root>10&&group.low>30&&group.high>10);}
  const key=(p,i)=>Array.from(p.slice(i,i+9)).map(v=>v.toFixed(4)).join(',');
  const foliage=new Set();for(let i=0;i<p.array.length;i+=9)foliage.add(key(p.array,i));
  for(const collider of Object.values(club.colliders))for(let i=0;i<collider.vertices.length;i+=9)assert.equal(foliage.has(key(collider.vertices,i)),false,'soft leaves never become a hard obstacle');
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
  console.log(JSON.stringify({triangles:total,staticDraws:9,dynamicDraws:5,realLights:CLUB_LIGHTS.length,supportTriangles:club.colliders.surface.indices.length/3,solidTriangles:club.colliders.solid.indices.length/3,seats:club.seats.length}));
  all.forEach(g=>g.dispose());
});
