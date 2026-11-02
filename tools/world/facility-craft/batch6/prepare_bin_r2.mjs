/** Bin R2 only. Frozen R1 files and bench native archives stay untouched. */
import {mkdirSync,readFileSync,writeFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {execFileSync}from'node:child_process';
import assert from'node:assert/strict';
import path from'node:path';
import {loadWorldModule,ROOT,families}from'../street/runtime.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const A=loadWorldModule(),R1=loadWorldModule('WorldStreetAssets.ts','?benchBin=r1'),current=families(A),reference=families(R1);
const visual=b=>[b.pos,b.nrm,b.col,b.mat,b.suv,b.idx,b.parts,b.cell];
for(const family of Object.keys(current))for(const lod of[0,1]){
  assert.equal(hash(current[family][lod].hulls().map(h=>[...h])),hash(reference[family][lod].hulls().map(h=>[...h])));
  if(family!=='bin'||lod===1)assert.equal(hash(visual(current[family][lod])),hash(visual(reference[family][lod])),family+' frozen');
}
const B=current.bin[0],bounds=b=>[0,1,2].map(axis=>{const p=b.pos.filter((_,i)=>i%3===axis);return[Math.min(...p),Math.max(...p)];});
assert.deepEqual(bounds(B),bounds(reference.bin[0]));
const protectedSources={};
for(const name of['WorldStreetKnock.tsx','WorldStreetFixed.tsx','WorldStreetStatic.tsx','WorldStreetBatch.ts','layout-v4.ts','WorldFacilitySurface.ts','WorldPark.tsx','WorldStreetMaterial.ts']){
 const file='src/components/world/'+name,raw=readFileSync(path.join(ROOT,file));
 assert.ok(raw.equals(execFileSync('git',['show','ad7ee76:'+file],{cwd:ROOT})),name+' changed');protectedSources[file]=createHash('sha256').update(raw).digest('hex');
}
const source={family:'bin',name:'bin',translation:[0,0,0],status:'R2-source-only-unrendered',position:B.pos,normal:B.nrm,color:B.col,index:B.idx,aMat:B.mat,aSuv:B.suv,
 parts:B.parts.map(p=>({...p,end:p.end<0?B.pos.length/3:p.end})),baselineHullSHA256:hash(reference.bin[0].hulls().map(h=>[...h]))};
const out=path.join(ROOT,'tools/world/facility-craft/batch6/next-bin-r2');mkdirSync(out,{recursive:true});
const raw=JSON.stringify(source);writeFileSync(path.join(out,'bin.source.json'),raw);
writeFileSync(path.join(out,'manifest.json'),JSON.stringify({status:'R2-source-only-unrendered',reference:'7107b14/R1',triangles:B.idx.length/3,referenceTriangles:reference.bin[0].idx.length/3,
 bounds:bounds(B),proxyUnchanged:true,L1Unchanged:true,otherFamiliesUnchanged:true,sourceSHA256:hash(raw),protectedSources},null,2)+'\n');
console.log(JSON.stringify({triangles:B.idx.length/3,bounds:bounds(B),proxyUnchanged:true,L1Unchanged:true,otherFamiliesUnchanged:true}));
