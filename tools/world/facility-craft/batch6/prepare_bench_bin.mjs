/** Exact bench/bin runtime source extraction plus frozen-contract proof.
 * Light-only: no native export, build, server, browser or visual acceptance. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadWorldModule, ROOT } from '../street/runtime.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const A=loadWorldModule('WorldStreetAssets.ts','?benchBin=r1'), baseline=loadWorldModule('WorldStreetAssets.ts','?benchBin=baseline');
const out=path.join(ROOT,'tools/world/facility-craft/batch6/next-bench-bin');mkdirSync(out,{recursive:true});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base='ad7ee76d68ce240d9ed8e4f1657a5e637e62700c';
const protectedFiles=['WorldStreetKnock.tsx','WorldStreetFixed.tsx','WorldStreetStatic.tsx','WorldStreetBatch.ts','layout-v4.ts','WorldFacilitySurface.ts','WorldPark.tsx','WorldStreetMaterial.ts'];
const manifest={status:'wired-source-only-unrendered',frozenCandidate:base,assets:{},protectedSources:{}};
for(const file of protectedFiles){const relative='src/components/world/'+file,old=execFileSync('git',['show',base+':'+relative],{cwd:ROOT});
  const current=readFileSync(path.join(ROOT,relative));assert.ok(current.equals(old),relative+' changed');
  manifest.protectedSources[relative]=createHash('sha256').update(current).digest('hex');}
for(const family of ['bench','bin']) {
  const pair=A[family](),basePair=baseline[family](),B=pair.L0;
  const contract=b=>hash({position:b.pos,normal:b.nrm,color:b.col,index:b.idx,parts:b.parts,hulls:b.hulls().map(h=>[...h])});
  assert.equal(contract(B),contract(basePair.L0),family+' geometry/proxy changed');
  for(let i=0;i<B.mat.length;i++)if(i%4!==3)assert.equal(B.mat[i],basePair.L0.mat[i],family+' source material factor changed');
  assert.equal(hash([pair.L1.pos,pair.L1.nrm,pair.L1.col,pair.L1.mat,pair.L1.suv,pair.L1.idx]),hash([basePair.L1.pos,basePair.L1.nrm,basePair.L1.col,basePair.L1.mat,basePair.L1.suv,basePair.L1.idx]),family+' L1 changed');
  const slots={};for(let i=3;i<B.mat.length;i+=4)slots[B.mat[i]]=(slots[B.mat[i]]??0)+1;
  const data={family,name:family,translation:[0,0,0],status:'wired-source-only-unrendered',position:B.pos,normal:B.nrm,color:B.col,index:B.idx,aMat:B.mat,aSuv:B.suv,
    baselineHullSHA256:hash(basePair.L0.hulls().map(h=>[...h])),
    parts:B.parts.map(p=>({...p,end:p.end<0?B.pos.length/3:p.end})),frozenContractSHA256:contract(basePair.L0)};
  const file=family+'.source.json';writeFileSync(path.join(out,file),JSON.stringify(data));
  manifest.assets[family]={source:file,triangles:B.idx.length/3,slots,contractUnchanged:true,L1Unchanged:true,sourceSHA256:hash(data)};
}
assert.equal(hash(A.BENCH_SEAT_LOCAL),hash(baseline.BENCH_SEAT_LOCAL));
const layout=loadWorldModule('layout-v4.ts','?layout=v4');
const bench=layout.solidsV4().find(s=>s.kind==='bench'&&s.position[0]===30.1);
const knockables=layout.knockablesV4();
const bin=knockables.find(s=>s.kind==='bin'&&s.road==='avenue')??knockables.find(s=>s.kind==='bin');
assert.ok(bench&&bin,'Representative placement missing');
const longZ=bench.size[2]>bench.size[0];
const benchYaw=bench.yaw+(longZ?(bench.position[0]<21?-Math.PI/2:Math.PI/2):(bench.position[2]<-42?Math.PI:0));
const view=(id,root,yaw,offset,targetY,instanceId)=>{
  const world=p=>[root[0]+Math.cos(yaw)*p[0]+Math.sin(yaw)*p[2],root[1]+p[1],root[2]-Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2]].map(x=>+x.toFixed(6));
  return {id,eye:world(offset),target:world([0,targetY,0]),instanceId,root,yaw,horizontalDistanceM:Math.hypot(offset[0],offset[2])};
};
const views=[view('bench-normal',[bench.position[0],bench.position[1]-bench.size[1]/2,bench.position[2]],benchYaw,[2.4,1.6,-3.4],.55,'bench at x=30.1'),
  view('bin-normal',bin.position,bin.yaw,[2.1,1.6,-2.5],.55,bin.id)];
writeFileSync(path.join(out,'review-views.json'),JSON.stringify(views,null,2)+'\n');
writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
