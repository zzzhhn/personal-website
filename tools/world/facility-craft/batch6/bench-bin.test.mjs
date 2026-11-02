import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorldModule, families } from '../street/runtime.mjs';
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));

test('bench/bin material switch preserves geometry/proxy/L1 and every other family',()=>{
  const A=loadWorldModule(),B=loadWorldModule('WorldStreetAssets.ts','?benchBin=baseline');
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
