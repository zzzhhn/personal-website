import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';
import{loadWorldModule,ROOT}from'../../street/runtime.mjs';import{sha,geom,snapshot}from'./prepare.mjs';
const frozen=JSON.parse(readFileSync(new URL('./baseline/manifest.json',import.meta.url))),base=loadWorldModule('WorldParkWalk.tsx','?walkCraft=baseline'),W=loadWorldModule('WorldParkWalk.tsx'),actual=snapshot(W);
test('baseline switch reproduces c4f7fca original geometry, P01 and contracts',()=>{const{base:_,...expected}=frozen;assert.deepEqual(JSON.parse(JSON.stringify(snapshot(base))),expected);});
for(let l=0;l<2;l++)test(`P02 L${l}: support slabs, P01 plaza, rail/lamp placements and walking geometry remain exact`,()=>{
 const old=frozen.walk[l],now=actual.walk[l];for(const k of['plaza','surfaces','rails','lamps'])assert.deepEqual(JSON.parse(JSON.stringify(now[k])),old[k]);
 const before=base.buildWalk(!!l),after=W.buildWalk(!!l);for(let i=0;i<3;i++){
  assert.equal(sha([...after.groups[i].deck.getAttribute('position').array]),sha([...before.groups[i].deck.getAttribute('position').array]));
  assert.equal(JSON.stringify(after.groups[i].center),JSON.stringify(before.groups[i].center));
  if(l)assert.equal(after.groups[i].triangles,before.groups[i].triangles);
 }
});
test('P03 explicit 40 kg cuboid, knock/sleep/reset and LOD controller unchanged',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(W.RAIL.spec)),frozen.rail.spec);
 const source=readFileSync(ROOT+'/src/components/world/WorldParkWalk.tsx','utf8'),old=execFileSync('git',['show',frozen.base+':src/components/world/WorldParkWalk.tsx'],{cwd:ROOT,encoding:'utf8'});
 const cut=s=>s.slice(s.indexOf('type KState ='),s.indexOf('export const RAIL =')).replace(/  const seededBodies =[^\n]*\n  const initialPose =[^\n]*\n/, '').replace(/      \/\/ Sleeping bodies can precede[\s\S]*?      }\n(?=      const near)/, '');assert.equal(cut(source),cut(old));
 assert.equal(sha(geom(W.LAMP.geometry)),sha(geom(base.LAMP.geometry)));
});
test('P03 near/far agree at .97 m; adjacent authored sections touch at the handrail',()=>{
 for(const g of[W.RAIL.geometry,W.RAIL.far]){g.computeBoundingBox();assert.ok(Math.abs(g.boundingBox.max.y-.97)<1e-6);assert.ok(Math.abs(g.boundingBox.min.z+1.01)<1e-6);assert.ok(Math.abs(g.boundingBox.max.z-1.01)<1e-6);}
 const placements=W.buildWalk().rails;const step=placements.filter(p=>p.id.startsWith('rail-1-l')).sort((a,b)=>a.id.localeCompare(b.id));
 assert.ok(step.length>=2);const a=step[0].position,b=step[1].position;assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[2]-b[2])-2.02)<1e-6);
});
test('UVs and slots survive batch merge and dynamic clone, finite cylinder seam unwrap',()=>{
 const walk=W.buildWalk();for(const g of[...walk.groups.flatMap(g=>[g.deck,g.solid]),W.RAIL.geometry,W.RAIL.far]){
  const c=g.clone(),p=c.getAttribute('position'),uv=c.getAttribute('aSuv'),m=c.getAttribute('aMat');assert.equal(uv.count,p.count);assert.equal(m.count,p.count);assert.ok([...uv.array].every(Number.isFinite));assert.ok([...m.array].some((v,i)=>i%4===3&&v===-1));assert.ok([...uv.array].some(v=>Math.abs(v)>.1));
  assert.equal(sha(geom(c)),sha(geom(g)));c.dispose();
 }
});
test('bounded source triangle additions, no new draw/material/per-frame owner',()=>{
 const near=actual.walk[0].groups.reduce((n,g)=>n+g.deckTris+g.solidTris,0),old=frozen.walk[0].groups.reduce((n,g)=>n+g.deckTris+g.solidTris,0);assert.ok(near-old<2200);assert.equal(actual.rail.triangles,156);assert.equal(actual.rail.farTriangles,36);
 const s=readFileSync(ROOT+'/src/components/world/WorldWalkCraft.ts','utf8');assert.doesNotMatch(s,/useFrame|MeshStandardMaterial|TextureLoader|setInterval/);
});
test('manufactured handrail/post grain axes and underside-bearing hardware contact',()=>{
 const C=loadWorldModule('WorldWalkCraft.ts'),r=C.craftParkRail().geometry,positions=r.getAttribute('position'),uv=r.getAttribute('aSuv'),mat=r.getAttribute('aMat');
 for(const [name,axis]of[['handrail.continuous',2],['post.vertical-grain',1]]){
  const part=r.userData.craftParts.find(p=>p.name===name),ids=Array.from({length:part.count},(_,j)=>j+part.start).filter(i=>mat.getW(i)===-1);
  const slope=ids.map(i=>uv.getX(i)-positions.getComponent(i,axis)/.7);assert.ok(Math.max(...slope)-Math.min(...slope)<1e-5);
 }
 const g=new C.WalkCraftGeo();C.walkBearing(g,[0,.97,0],0);const b=g.build();b.computeBoundingBox();
 // Stringer bottom .86, crossbeam top .86; the .014 m strap crosses this interface.
 assert.ok(b.boundingBox.min.y<.86&&b.boundingBox.max.y>.86);assert.ok(b.boundingBox.min.x<-.07&&b.boundingBox.max.x>.07);
});
test('cylinder long grain has local origin and no UV interpolation across its wrap seam',()=>{
 const C=loadWorldModule('WorldWalkCraft.ts'),g=new C.WalkCraftGeo();g.cyl([64,-2.6,-40],[64,.86,-40],.15,.13,8,'#8E6E55',{smooth:true});const b=g.build(),m=b.getAttribute('aMat'),uv=b.getAttribute('aSuv'),period=2*Math.PI*.14/(.7*466/1024);
 let side=0,cut=0;for(let t=0;t<m.count;t+=3){if(m.getW(t)===-1){side++;const v=[uv.getY(t),uv.getY(t+1),uv.getY(t+2)];assert.ok(Math.max(...v)-Math.min(...v)<period/2+1e-6);}else cut++;}assert.equal(side,16);assert.equal(cut,16);
});
test('actual visual initializer handles origin, late/recreated bodies and transformed parent without physics mutations',async()=>{
 const{Matrix4,Quaternion,Vector3}=await import('three'),{runInNewContext}=await import('node:vm');const source=readFileSync(ROOT+'/src/components/world/WorldParkWalk.tsx','utf8');const start=source.indexOf('      const body = bodies.current?.[i];',source.indexOf('const syncVisuals')),end=source.indexOf('      const near =',start);assert.ok(start>0&&end>start);const code='{ '+source.slice(start,end)+' }';
 let reads=0,writes=0;const stored=new Matrix4(),matrix=new Matrix4(),parent=new Matrix4().compose(new Vector3(4,2,7),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.4),new Vector3(2,3,4));
 const proxy={matrixWorld:parent,updateWorldMatrix(){},getWorldScale(v){return v.set(2,3,4);},setMatrixAt(i,m){writes++;stored.copy(m);},instanceMatrix:{needsUpdate:false}},make=(position,valid=true)=>({isValid:()=>valid,translation(){reads++;return position;},rotation(){return{x:0,y:0,z:0,w:1};}});
 const context={i:0,bodies:{current:[null]},seededBodies:{current:[]},matrix,e:matrix.elements,initialPose:{inverse:new Matrix4(),position:new Vector3(),rotation:new Quaternion(),scale:new Vector3()},proxy};
 runInNewContext(code,context);assert.equal(writes,0);
 context.bodies.current[0]=make({x:0,y:0,z:0},false);runInNewContext(code,context);assert.equal(writes,0);
 const origin=make({x:0,y:0,z:0});context.bodies.current[0]=origin;runInNewContext(code,context);assert.equal(writes,1);assert.equal(reads,1);assert.equal(context.seededBodies.current[0],origin);
 const world=parent.clone().multiply(stored),expected=new Matrix4().makeScale(2,3,4);assert.ok(world.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-9));
 runInNewContext(code,context);assert.equal(writes,1);assert.equal(reads,1);
 const replacement=make({x:68.56,y:1.14,z:-33.4});context.bodies.current[0]=replacement;runInNewContext(code,context);assert.equal(writes,2);assert.equal(reads,2);const final=parent.clone().multiply(stored);assert.ok(Math.abs(final.elements[12]-68.56)<1e-9);assert.ok(Math.abs(final.elements[13]-1.14)<1e-9);assert.ok(Math.abs(final.elements[14]+33.4)<1e-9);
 runInNewContext(code,context);assert.equal(writes,2);assert.equal(reads,2);
});
