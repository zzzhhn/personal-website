import test from'node:test';import assert from'node:assert/strict';
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{Matrix4,Vector3}from'three';import{loadWorldModule,families}from'../../street/runtime.mjs';
import{fixture}from'./fixture.mjs';
import Rapier from '@dimforge/rapier3d-compat';
import {mountStreetContacts} from '../../street/contact-fixture.mjs';
const[A,R,C,G]=loadWorldModule(['WorldStreetAssets.ts','WorldRailCraft.ts','WorldStreetFacilityCraft.ts','WorldStreetGeometry.ts']);
const base=JSON.parse(readFileSync(new URL('./baseline/manifest.json',import.meta.url))),span=base.actual.seaStep;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),proxy=b=>[b.pos,b.idx,b.hulls().map(h=>[...h])];
const variants=lod=>[['sea',A.seawallBay(lod,2),b=>R.craftSeawallBay(b,span,lod)],['end',A.railEndPost(lod,'seawall'),b=>R.craftSeawallEnd(b,lod)],
 ['post',A.timberPost(lod),b=>R.craftTimberPost(b,lod)],['beam',A.timberBeam(lod,4.26),b=>R.craftTimberBeam(b,4.26,lod)]];

test('binding an installed factory preserves its complete rendering and selects its existing physics source',()=>{
 for (const pair of Object.values(families(A))) for (const source of pair) {
   const fingerprint = b => hash([b.pos,b.nrm,b.col,b.mat,b.suv,b.idx,b.parts,b.cell,b.hulls().map(h=>[...h])]);
   const before = fingerprint(source), bound = C.bindStreetFacilityCollision(new G.Builder(),source);
   assert.deepEqual(bound.hulls(),source.hulls());
   assert.equal(fingerprint(source),before);
 }
 const original=A.seawallBay(0),root=C.streetFacilityCollision(original),one=C.bindStreetFacilityCollision(new G.Builder(),original),two=C.bindStreetFacilityCollision(new G.Builder(),one);
 assert.equal(C.streetFacilityCollision(two),root);assert.equal(C.streetFacilityCollision(one),root);assert.deepEqual(two.hulls(),root.hulls());
 assert.throws(()=>C.bindStreetFacilityCollision(root,root),/cannot bind itself/);
});
test('near/far visuals bind the exact full original collision Builder and never mutate its geometry',()=>{
 for(const lod of[0,1])for(const[name,old,craft]of variants(lod)){const root=C.streetFacilityCollision(old),before=hash(proxy(root)),visual=craft(old);
  assert.notEqual(visual,root,name);assert.equal(C.streetFacilityCollision(visual),root,name);assert.equal(hash(proxy(root)),before,name+' proxy positions/index/hulls');
  assert.deepEqual(visual.hulls(),root.hulls());
  if(lod===1&&['post','beam'].includes(name)){
    const expanded=b=>b.idx.map(i=>[...b.pos.slice(i*3,i*3+3),...b.nrm.slice(i*3,i*3+3),...b.col.slice(i*3,i*3+3)]);
    assert.equal(hash(expanded(visual)),hash(expanded(old)),name+' far triangle shape/normal/color');
  }
 }
});
test('both seawall LOD spans close all adjacent placements and the terminal post without length compensation elsewhere',()=>{
 for(const lod of[0,1]){const B=R.craftSeawallBay(A.seawallBay(lod,2),span,lod),p=B.parts.find(p=>p.name==='handrail'),end=p.end<0?B.pos.length/3:p.end;
  const ends=[];for(let i=p.start;i<end;i++)if(B.pos[i*3]>span/2&&B.nrm[i*3]>.99)ends.push(B.pos[i*3]);
  assert.ok(ends.length);assert.ok(ends.every(x=>Math.abs(x-span)<1e-9));
  const total=span*base.actual.seaBayCount;assert.ok(Math.abs(total-53)<1e-9);
  for(let bay=0;bay<base.actual.seaBayCount;bay++)assert.ok(Math.abs(bay*span+Math.max(...ends)-(bay+1)*span)<1e-9);
 }
 for(const lod of[0,1]){const B=R.craftTimberBeam(A.timberBeam(lod,4.26),4.26,lod);assert.ok(Math.abs(Math.max(...B.pos.filter((_,i)=>i%3===0))-2.13)<1e-8);}
});
test('baseline and legacy return original visuals/proxies by identity for both LODs',()=>{
 for(const query of['?railCraft=baseline','?facilityCraft=legacy']){const[a,r]=loadWorldModule(['WorldStreetAssets.ts','WorldRailCraft.ts'],query);
  for(const lod of[0,1]){for(const[b,fn]of[[a.seawallBay(lod,2),v=>r.craftSeawallBay(v,span,lod)],[a.railEndPost(lod,'seawall'),v=>r.craftSeawallEnd(v,lod)],
   [a.timberPost(lod),v=>r.craftTimberPost(v,lod)],[a.timberBeam(lod,4.26),v=>r.craftTimberBeam(v,4.26,lod)]])assert.equal(fn(b),b);}
 }
});
test('candidate winding/normal/finite channels and cylindrical wood corner UVs are valid in both LODs',()=>{
 for(const lod of[0,1])for(const[name,old,craft]of variants(lod)){const b=craft(old);for(const values of[b.pos,b.nrm,b.col,b.mat,b.suv])assert.ok(values.every(Number.isFinite),name);
  for(let i=0;i<b.idx.length;i+=3){const ids=b.idx.slice(i,i+3),[a,c,d]=ids.map(k=>new Vector3(...b.pos.slice(k*3,k*3+3))),cross=c.sub(a).cross(d.sub(a));
   assert.ok(cross.length()>1e-10,name+' nondegenerate');const normal=ids.reduce((n,k)=>n.add(new Vector3(...b.nrm.slice(k*3,k*3+3))),new Vector3());assert.ok(cross.dot(normal)>0,name+' outward winding');
   if(ids.every(k=>b.mat[k*4+3]===-1)){const uv=ids.map(k=>b.suv.slice(k*2,k*2+2));assert.ok(Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[2][0]-uv[0][0])*(uv[1][1]-uv[0][1]))>1e-10,name+' wood UV area');
    const v=uv.map(p=>p[1]),period=2*Math.PI*(name==='post'?.1:.085)/(.7*466/1024);assert.ok(Math.max(...v)-Math.min(...v)<period/2,name+' no wrap stretch');}
  }
 }
});
test('wood anchor actually crosses the cheeks below the seat and remains perpendicular to the real sloped beam',()=>{
 const B=R.craftTimberPost(A.timberPost(0),0),p=B.parts.find(p=>p.name==='post.anchor-pin'),end=p.end<0?B.pos.length/3:p.end;
 const points=Array.from({length:end-p.start},(_,i)=>B.pos.slice((p.start+i)*3,(p.start+i)*3+3));assert.ok(points.every(p=>p[1]>=.5&&p[1]<=.57));
 const direction=new Vector3(0,0,1).transformDirection(new Matrix4().fromArray(base.actual.selectedTimberPosts[0]));
 const beamAxis=new Vector3(1,0,0).transformDirection(new Matrix4().fromArray(base.actual.beamMatrix));assert.ok(Math.abs(direction.dot(beamAxis))<1e-9);
});
test('actual sloped timber is locked to a pedestrian, yields to a vehicle and returns to its installed pose', t => {
 const {item,L0,L1}=fixture().timber.find(({item})=>Math.abs(item.pitch)>.02);
 const host=mountStreetContacts('rail',[item]);t.after(host.dispose);
 const {body}=host.bodies[0],[x,y,z]=item.position;
 const camera=[x+5,y+2,z], home=body.translation(), firstRotation=body.rotation();
 assert.ok(body.isSleeping()&&host.state()[0].lockedForPeople);
 assert.ok(Math.abs(body.mass()-45)<.001&&Math.abs(body.localCom().y-.085)<.001);
 for(const [distance,builder] of [[5,L0],[45,L1]]) {
   host.frame([x+distance,y+2,z]);
   const {indexCount,vertexStart,vertexCount}=host.mesh.getGeometryRangeAt(host.mesh.getGeometryIdAt(0));
   assert.equal(indexCount,builder.idx.length);assert.equal(vertexCount,builder.pos.length/3);
   const positions=host.mesh.geometry.getAttribute('position');
   for(let i=0;i<vertexCount;i++) for(let axis=0;axis<3;axis++){
     assert.equal(positions.getComponent(vertexStart+i,axis),Math.fround(builder.pos[3*i+axis]));
   }
 }
 const vehicle=host.world.createRigidBody(Rapier.RigidBodyDesc.dynamic().setTranslation(x,y,z+4));
 vehicle.userData={vehicle:'offroad'};host.beforePhysics();
 assert.equal(host.state()[0].lockedForPeople,false);
 body.applyImpulse({x:0,y:0,z:90},true);
 for(let i=0;i<24;i++){host.beforePhysics();host.world.step();host.frame(camera);}
 assert.ok(body.translation().z>home.z+.35);
 assert.equal(host.state()[0].phase,'knocked');
 vehicle.setTranslation({x:x+15,y,z},true);
 for(let i=0;i<32*60;i++)host.frame(camera);
 assert.deepEqual({...body.translation()},{...home});
 assert.deepEqual({...body.rotation()},{...firstRotation});
 assert.ok(body.isSleeping()&&host.state()[0].lockedForPeople);
});
test('installed rail factories preserve placements and repair first/middle/last seams in both LODs',()=>{
 const f=fixture(),sea=f.actual.placements.filter(p=>p.kind==='seawallBay'),terminal=f.actual.placements.find(p=>p.kind==='seawallEnd'),kind=f.actual.kinds.find(k=>k.id==='seawallBay');
 assert.equal(hash(f.actual.placements.map(p=>[p.kind,p.matrix.toArray()])),base.actual.placementSHA256);assert.equal(hash(f.actual.beams),base.actual.beamLayoutSHA256);
 for(const lod of[0,1])for(const at of[0,Math.floor(sea.length/2),sea.length-1]){
  const geometry=kind[lod===0?'L0':'L1'],p=geometry.parts.find(p=>p.name==='handrail'),end=p.end<0?geometry.pos.length/3:p.end;
  let max=-Infinity;for(let i=p.start;i<end;i++)max=Math.max(max,geometry.pos[i*3]);
  const tip=new Vector3(max,1,0).applyMatrix4(sea[at].matrix),next=new Vector3(0,1,0).applyMatrix4(sea[at+1]?.matrix??terminal.matrix);assert.ok(tip.distanceTo(next)<1e-8);
  const proxy=f.C.streetFacilityCollision(geometry),original=f.C.streetFacilityCollision(f.A.seawallBay(lod,2));assert.equal(hash(proxy.pos),hash(original.pos));assert.equal(hash(proxy.idx),hash(original.idx));
 }
 for(const beam of f.timber)for(const lod of[0,1]){const B=beam[lod===0?'L0':'L1'],old=f.A.timberBeam(lod,beam.item.len);
  assert.equal(hash(proxy(f.C.streetFacilityCollision(B))),hash(proxy(f.C.streetFacilityCollision(old))));}
});
test('real BatchedMesh merge retains physical slots and nonzero manufactured UVs',()=>{
 const f=fixture(),kinds=f.actual.kinds.filter(k=>['seawallBay','seawallEnd','timberPost'].includes(k.id));
 const sample=f.timber[0];kinds.push({id:'timber-test',L0:sample.L0,L1:sample.L1,lodNear:20,far:80});
 const baked=kinds.map(k=>({...k,L0:k.L0.build(),L1:k.L1.build()})),batch=new f.Batch.StreetBatch('rail-proof',baked,kinds.map(()=>1),null);
 const mat=batch.mesh.geometry.getAttribute('aMat'),uv=batch.mesh.geometry.getAttribute('aSuv'),slots=new Set();for(let i=0;i<mat.count;i++)slots.add(mat.getW(i));
 assert.ok(slots.has(-1)&&slots.has(-2)&&slots.has(-3));assert.ok(Array.from(uv.array).some(x=>Math.abs(x)>.1));batch.dispose();
});
