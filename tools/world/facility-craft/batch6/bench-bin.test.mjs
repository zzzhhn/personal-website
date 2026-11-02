import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorldModule, families } from '../street/runtime.mjs';
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));

test('bench/bin material switch preserves geometry/proxy/L1 and every other family',()=>{
  const A=loadWorldModule('WorldStreetAssets.ts','?benchBin=r1'),B=loadWorldModule('WorldStreetAssets.ts','?benchBin=baseline');
  const current=families(A),base=families(B);
  for(const name of Object.keys(current))for(const level of [0,1]){
    const a=current[name][level],b=base[name][level];
    same([a.pos,a.nrm,a.col,a.idx,a.parts,a.cell,a.hulls().map(h=>[...h])],[b.pos,b.nrm,b.col,b.idx,b.parts,b.cell,b.hulls().map(h=>[...h])]);
    if(level===1||!['bench','bin'].includes(name))same([a.mat,a.suv],[b.mat,b.suv]);
  }
  same(A.BENCH_SEAT_LOCAL,B.BENCH_SEAT_LOCAL);
  const bin=current.bin[0],old=base.bin[0],part=bin.parts.find(p=>p.name==='mouth.inner-baffle');
  for(let i=part.start;i<part.end;i++)same(bin.mat.slice(i*4,i*4+4),old.mat.slice(i*4,i*4+4));
});

test('bench grain follows X, every wood triangle has noncollapsed UV, and tagging is stable',()=>{
  const A=loadWorldModule(),{tagBenchBinSurfaces}=loadWorldModule('WorldBenchBinSurface.ts');
  const B=A.bench().L0,part=B.parts.find(p=>p.name==='seat.slat-0');
  const top=Array.from({length:part.end-part.start},(_,i)=>i+part.start).filter(i=>B.nrm[i*3+1]>.99);
  const a=top[0],b=top.find(i=>Math.abs(B.pos[i*3]-B.pos[a*3])>.5);
  assert.ok(b!==undefined);assert.ok(Math.abs((B.suv[b*2]-B.suv[a*2])-(B.pos[b*3]-B.pos[a*3])/.7)<1e-8);
  let woodTriangles=0;
  for(let i=0;i<B.idx.length;i+=3){const [a,b,c]=B.idx.slice(i,i+3);if(B.mat[a*4+3]!==-1)continue;woodTriangles++;
    const u=B.suv[b*2]-B.suv[a*2],v=B.suv[b*2+1]-B.suv[a*2+1],x=B.suv[c*2]-B.suv[a*2],y=B.suv[c*2+1]-B.suv[a*2+1];
    assert.ok(Math.abs(u*y-v*x)>1e-10,'collapsed wood UV at triangle '+i/3);
  }
  assert.ok(woodTriangles>100);const before=JSON.stringify([B.mat,B.suv]);tagBenchBinSurfaces(B,'bench');assert.equal(JSON.stringify([B.mat,B.suv]),before);
});

test('bin R2 retains R1 envelope/proxy/L1, drum and hinge; bench and other families are frozen',()=>{
  const A=loadWorldModule(),R1=loadWorldModule('WorldStreetAssets.ts','?benchBin=r1');
  const current=families(A),base=families(R1);
  for(const name of Object.keys(current))for(const level of [0,1]){
    const a=current[name][level],b=base[name][level];
    same(a.hulls().map(h=>[...h]),b.hulls().map(h=>[...h]));
    if(name!=='bin'||level===1)same([a.pos,a.nrm,a.col,a.mat,a.suv,a.idx,a.parts,a.cell],[b.pos,b.nrm,b.col,b.mat,b.suv,b.idx,b.parts,b.cell]);
  }
  const bin=current.bin[0],r1=base.bin[0];
  const bounds=b=>[0,1,2].map(axis=>{const p=b.pos.filter((_,i)=>i%3===axis);return[Math.min(...p),Math.max(...p)];});
  same(bounds(bin),bounds(r1));same(bounds(bin),[[-.305,.305],[0,.995],[-.305,.305]]);
  const points=(b,name)=>{const p=b.parts.find(p=>p.name===name);return b.pos.slice(p.start*3,(p.end<0?b.pos.length/3:p.end)*3);};
  for(const name of ['drum','lid.hinge'])same(points(bin,name),points(r1,name));
  const vertices=name=>{const p=points(bin,name);return Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));};
  assert.ok(vertices('mouth.inner-baffle').every(p=>p[1]<.55),'floor must visibly recede below throat');
  assert.ok(vertices('base.contact-pad').some(p=>p[1]===0),'pad meets unchanged ground datum');
  assert.ok(vertices('base.contact-pad').some(p=>p[1]===0&&Math.hypot(p[0],p[2])>.22),'pad must be exposed beyond original .215m foot at contact');
  const lip=bin.parts.find(p=>p.name==='mouth.rolled-metal-lip');
  for(let i=lip.start;i<lip.end;i++)assert.equal(bin.mat[i*4+3],-3,'bare lip');
  for(const name of ['mouth.inner-liner-upper','mouth.inner-liner-lower','mouth.inner-baffle','neck.compressed-gasket','base.contact-pad']){
    const p=bin.parts.find(p=>p.name===name);for(let i=p.start;i<p.end;i++)assert.equal(bin.mat[i*4+3],0,'matte liner/pad');
  }
  same(A.BENCH_SEAT_LOCAL,R1.BENCH_SEAT_LOCAL);
  const C=loadWorldModule('WorldStreetFacilityCraft.ts'),original=loadWorldModule('WorldStreetAssets.ts','?facilityCraft=legacy').bin().L0;
  assert.equal(C.streetFacilityCollision(C.finishStreetFacility(original,'bin',0)),original);
});
