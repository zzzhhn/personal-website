/** Evidence contracts only. Visual acceptance and full-island GPU cost are separate. */
import assert from'node:assert/strict';
import{readFileSync,readdirSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{execFileSync}from'node:child_process';
import path from'node:path';
import{ROOT}from'../street/runtime.mjs';
const folder='docs/world/phase-2-playground/asset-batch6-20261103/bench-bin',out=folder+'/runtime-r2';
const raw=file=>readFileSync(path.join(ROOT,file)),read=file=>JSON.parse(raw(file)),stage=name=>read(out+'/'+name+'.json');
const sha=value=>createHash('sha256').update(value).digest('hex'),checks=[];
const r1=stage('bin-normal-noon-r1'),r2=stage('bin-normal-noon-r2');
for(const[name,view,time]of[['bin-normal-noon-r1','bin-normal',720],['bin-normal-noon-r2','bin-normal',720],['bin-normal-night-r2','bin-normal',0],['bench-normal-night-r1','bench-normal',0]]){
 const d=stage(name);assert.equal(d.view.id,view);assert.equal(d.time,time);assert.equal(d.night,time===0?1:0);
 assert.deepEqual(d.canvas,[1710,931]);assert.equal(d.fov,50);assert.equal(d.exposure,1);assert.equal(d.blend,1);assert.equal(d.quality,'balanced');
 assert.equal(d.loading.active,false);assert.equal(d.loading.failed,0);assert.equal(d.shadow.pending,false);
 assert.equal(raw(out+'/'+name+'.jpg').subarray(0,3).toString('hex'),'ffd8ff');
}
assert.equal(r1.surfaceMode,'r1');assert.equal(r2.surfaceMode,'r2');assert.deepEqual(r1.view,r2.view);
for(const key of Object.keys(r1.registeredAssets))if(key!=='world-street')assert.deepEqual(r1.registeredAssets[key],r2.registeredAssets[key],key);
assert.equal(r2.registeredAssets['world-street'].nominalTriangles-r1.registeredAssets['world-street'].nominalTriangles,2256);
assert.equal(r1.renderer.render.calls,r2.renderer.render.calls);assert.equal(r1.renderer.memory.textures,r2.renderer.memory.textures);
checks.push('same ordinary view/day settings; two settled night views; only expected street geometry digest changes');
const approach=stage('bench-approach'),seated=stage('bench-seated'),standing=stage('bench-standing');
assert.equal(approach.actionResult.ok,true);assert.equal(approach.nearby.id,seated.seat.id);assert.equal(seated.seat.id,'street-bench-34');
assert.equal(seated.guide.animation,'SitIdle');assert.equal(seated.guide.movementLocked,true);assert.ok(Math.hypot(...seated.guide.seatSupport.errorXYZ)<.005);
assert.equal(standing.seat,null);assert.equal(standing.grounded,true);assert.equal(standing.guide.animation,'Idle');assert.equal(standing.guide.movementLocked,false);
checks.push('actual registered bench E sit/stand; measured post-skin seat contact and grounded standing');
const before=stage('bin-collision-before'),pushed=stage('bin-pushed'),restored=stage('bin-restored'),after=stage('bin-collision-after');
for(const d of[before,after]){assert.equal(d.probe.hit,true);assert.equal(d.probe.other.name,'street-knock-bin-0');}
for(const d of[before,pushed,restored,after]){assert.equal(d.bin.mass,16);assert.equal(d.bin.colliders,2);assert.ok(Math.abs(d.bin.localCom[1]-.3)<1e-6);assert.equal(d.bin.locked,false);}
assert.equal(pushed.bin.phase,'knocked');assert.ok(pushed.bin.displacement>.12);assert.equal(restored.resetComplete,true);assert.equal(restored.bin.phase,'home');
assert.ok(restored.bin.displacement<.001);assert.ok(Math.abs(restored.bin.position[1]-restored.bin.home[1])<.01);
assert.deepEqual(restored.events.map(e=>e.phase),['home','knocked','fadeOut','fadeIn','home']);
const delay=restored.events[2].elapsedMs-restored.events[1].elapsedMs;assert.ok(delay>=30000&&delay<33000);
checks.push('actual bin capsule collision before/after; impulse response; unmodified 30s/fade reset; mass/COM/2 colliders unchanged');
const native=read('public/assets/world/craft-batch6-bin-r2/bin-export-report.json');
assert.equal(native.triangles,4436);assert.equal(native.freshBoundsDelta,0);assert.equal(native.sourceJSONSHA256,sha(raw('tools/world/facility-craft/batch6/next-bin-r2/bin.source.json')));
const sources={};for(const name of['WorldBenchBinSurface.ts','WorldBinConstruction.ts','WorldStreetFacilityCraft.ts']){
 const file='src/components/world/'+name;assert.equal(sha(raw(file)),sha(execFileSync('git',['show','7253ec6:'+file],{cwd:ROOT})));sources[file]=sha(raw(file));
}
for(const name of['WorldStreetKnock.tsx','WorldStreetFixed.tsx','WorldStreetStatic.tsx','WorldStreetBatch.ts','layout-v4.ts','WorldFacilitySurface.ts','WorldPark.tsx','WorldStreetMaterial.ts']){
 const file='src/components/world/'+name;assert.equal(sha(raw(file)),sha(execFileSync('git',['show','ad7ee76:'+file],{cwd:ROOT})));sources[file]=sha(raw(file));
}
assert.equal(stage('console-errors').filter(e=>e.level==='error').length,0);checks.push('exact frozen production source/native source; protected adapters/shared shader unchanged; no browser errors');
const files=[...readdirSync(path.join(ROOT,out)).filter(n=>n!=='manifest.json').map(n=>out+'/'+n),
 'public/assets/world/craft-batch6-bin-r2/bin-portable.glb','public/assets/world/craft-batch6-bin-r2/bin-export-report.json','tools/world/facility-craft/batch6/native-bin-r2/bin.blend',
 'astro.batch6.bin-r2.config.mjs','tools/world/facility-craft/batch6/interactions.ts'];
const result={status:'main ordinary-view candidate accepted; required bounded night/interaction checks pass; user visual acceptance and full-island GPU cost remain separate',sourceCommit:'7253ec60b053370d449efde37f09f64d347b3118',checks,
 observations:{calls:[r1.renderer.render.calls,r2.renderer.render.calls],textures:[r1.renderer.memory.textures,r2.renderer.memory.textures],nearTriangles:[2180,4436],addedNearTriangles:2256,addedSourceBufferBytes:162432,resetDelayMs:delay},sources,
 hashes:Object.fromEntries(files.map(file=>[file,sha(raw(file))]))};
writeFileSync(path.join(ROOT,out+'/manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks,hashedFiles:files.length,observations:result.observations}));
