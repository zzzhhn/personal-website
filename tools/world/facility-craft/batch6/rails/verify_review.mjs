/** Bounded owned-source/artifact contracts. This does not measure taste or GPU time. */
import assert from'node:assert/strict';import{readFileSync,readdirSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import path from'node:path';
import{ROOT}from'../../street/runtime.mjs';import{fixture}from'./fixture.mjs';
const folder='docs/world/phase-2-playground/asset-batch6-20261103/rails',out=folder+'/runtime-r2';
const raw=file=>readFileSync(path.join(ROOT,file)),read=file=>JSON.parse(raw(file)),sha=v=>createHash('sha256').update(v).digest('hex');
const checks=[],observations={};
for(const family of['seawall','timber']){
 const records={};for(const[time,modes]of[['noon',['baseline','candidate']],['night',['candidate']]])for(const mode of modes){
  const stem=out+'/'+family+'-normal-'+time+'-'+mode,d=read(stem+'.json');records[time+'-'+mode]=d;
  assert.equal(raw(stem+'.jpg').subarray(0,3).toString('hex'),'ffd8ff');assert.equal(d.baseline,'97c9546');assert.equal(d.group,'rails');assert.equal(d.surfaceMode,mode);
  assert.equal(d.view.id,family+'-normal');assert.deepEqual(d.canvas,[1710,931]);assert.equal(d.fov,50);assert.equal(d.exposure,1);assert.equal(d.quality,'balanced');
  assert.equal(d.time,time==='noon'?720:0);assert.equal(d.night,time==='noon'?0:1);assert.equal(d.blend,1);assert.equal(d.loading.active,false);assert.equal(d.loading.failed,0);assert.equal(d.shadow.pending,false);
  const gate=d.reviewReady;assert.equal(gate.ready,true);assert.equal(gate.viewId,d.view.id);assert.equal(gate.currentMode,mode);assert.equal(gate.expectedMode,mode);assert.equal(gate.cameraReady,true);
  assert.deepEqual(gate.cameraPosition,d.view.eye);assert.equal(gate.texturesReady,true);assert.equal(gate.textures.length,3);
  for(const t of gate.textures){assert.ok(t.uuid);assert.equal(t.width,1024);assert.equal(t.height,512);assert.ok(t.version>0);assert.equal(t.gpuVersion,t.version);}
  assert.equal(d.reviewWarmup.minimumStableMs,3000);assert.ok(d.reviewWarmup.stableAgeMs>=3000);assert.ok(d.reviewWarmup.checks>=3);
  for(const[name,hash]of Object.entries(d.sourceVersion.hashes))assert.equal(sha(raw('src/components/world/'+name)),hash,name+' differs from photographed source');
 }
 const a=records['noon-baseline'],b=records['noon-candidate'];assert.deepEqual(a.view,b.view);assert.deepEqual(b.view,records['night-candidate'].view);
 for(const root of Object.keys(a.registeredAssets))if(root!=='world-street')assert.deepEqual(a.registeredAssets[root],b.registeredAssets[root],root);
 assert.equal(b.registeredAssets['world-street'].nominalTriangles-a.registeredAssets['world-street'].nominalTriangles,1696);
 assert.equal(a.renderer.render.calls,b.renderer.render.calls);assert.equal(a.renderer.memory.textures,b.renderer.memory.textures);
 observations[family]={calls:[a.renderer.render.calls,b.renderer.render.calls],textures:[a.renderer.memory.textures,b.renderer.memory.textures]};
 checks.push(family+': matched ordinary pair and one night; actual camera/mode, CPU/GPU texture upload, shadow and new stability window');
}
const base=read('tools/world/facility-craft/batch6/rails/baseline/manifest.json');
for(const[file,hash]of Object.entries(base.sources))if(!['WorldStreetRails.tsx','WorldStreetKnock.tsx','WorldStreetFacilityCraft.ts'].some(name=>file.endsWith('/'+name)))assert.equal(sha(raw(file)),hash,file+' protected');
const textureHashes={};for(const name of['wood-color.png','wood-normal.png','wood-rough.png']){
 const file='public/assets/world/craft-batch6-facilities/'+name;textureHashes[file]=sha(raw(file));assert.equal(textureHashes[file],sha(execFileSync('git',['show','97c9546:'+file],{cwd:ROOT,maxBuffer:4*1024*1024})));
}
for(const family of['seawall','timber']){const report=read('public/assets/world/craft-batch6-rails/'+family+'-export-report.json');
 assert.equal(report.sourceJSONSHA256,sha(raw('tools/world/facility-craft/batch6/rails/source/'+family+'.source.json')));assert.equal(report.freshBoundsDelta,0);assert.equal(report.triangles,family==='seawall'?1060:916);
 assert.equal(report.portableSHA256,sha(raw('public/assets/world/craft-batch6-rails/'+family+'-portable.glb')));
}
assert.equal(read(out+'/console-errors.json').filter(x=>x.level==='error').length,0);checks.push('owned source and original shared maps; native source/portable hashes and fresh import; no browser errors');
function cost(search){const f=fixture(search),statics=f.actual.kinds.filter(k=>['seawallBay','seawallEnd','timberPost'].includes(k.id));
 const beams=[...new Map(f.timber.map(t=>[t.item.len.toFixed(2),t])).values()],pairs=[...statics.map(k=>[k.L0,k.L1]),...beams.map(t=>[t.L0,t.L1])];
 return{kinds:pairs.length,nearTriangles:pairs.reduce((n,p)=>n+p[0].idx.length/3,0),farTriangles:pairs.reduce((n,p)=>n+p[1].idx.length/3,0),sourceBufferBytes:pairs.reduce((n,p)=>n+p.reduce((s,b)=>s+(b.pos.length+b.nrm.length+b.col.length+b.mat.length+b.suv.length+b.idx.length)*4,0),0)};
}
observations.geometry={baseline:cost('?railCraft=baseline'),candidate:cost('')};
assert.deepEqual(observations.geometry,{baseline:{kinds:13,nearTriangles:3242,farTriangles:430,sourceBufferBytes:397884},candidate:{kinds:13,nearTriangles:4938,farTriangles:430,sourceBufferBytes:1030656}});
checks.push('bounded actual static/dynamic kind costs; no FPS or GPU-time inference');
const files=[...readdirSync(path.join(ROOT,out)).filter(name=>name!=='manifest.json').map(name=>out+'/'+name),
 ...['seawall','timber'].flatMap(name=>['public/assets/world/craft-batch6-rails/'+name+'-portable.glb','public/assets/world/craft-batch6-rails/'+name+'-export-report.json','tools/world/facility-craft/batch6/rails/native/'+name+'.blend']),
 'astro.batch6.rails.config.mjs'];
writeFileSync(path.join(ROOT,out+'/manifest.json'),JSON.stringify({status:'main accepted ordinary candidates; bounded night/source checks; user visual acceptance separate',sourceCommit:'e6152bf227016f775e94376439c441e7e7631751',checks,observations,textureHashes,
 hashes:Object.fromEntries(files.map(file=>[file,sha(raw(file))]))},null,2)+'\n');console.log(JSON.stringify({checks,hashedFiles:files.length,observations}));
