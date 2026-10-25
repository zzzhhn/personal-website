// Reuse the production Rapier capsule test against each additional authored route.
// The original test and its collision thresholds stay unchanged.
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const base=resolve('public/world/alpha-mine'),manifest=JSON.parse(readFileSync(join(base,'layout.json'),'utf8'));
const routes={gallery:manifest.gallery.route,
 westLink:[...manifest.route.points.slice(0,7),manifest.gallery.coreConnection.a,...manifest.gallery.route.slice(3)]};
const results={};
for(const [name,points] of Object.entries(routes)){
 const folder=mkdtempSync(join(tmpdir(),'quarry-route-'));
 try{
  const copy=structuredClone(manifest);copy.route.points=points;
  writeFileSync(join(folder,'layout.json'),JSON.stringify(copy));symlinkSync(join(base,'colliders.json'),join(folder,'colliders.json'));
  const r=spawnSync(process.execPath,['--test','src/components/world/alpha-mine-physics.test.mjs'],{
   encoding:'utf8',env:{...process.env,ALPHA_MINE_TEST_ASSETS:folder},maxBuffer:64*1024});
  results[name]={passed:r.status===0,points,output:(r.stdout+r.stderr).trim()};
 }finally{rmSync(folder,{recursive:true,force:true});}
}
writeFileSync('tools/world/alpha-mine/evidence/gallery-physics-qa.json',JSON.stringify(results,null,1)+'\n');
for(const [name,r] of Object.entries(results))console.log(name,r.passed?'PASS':'FAIL');
if(Object.values(results).some(r=>!r.passed)){
 for(const r of Object.values(results))if(!r.passed)console.error(r.output);
 process.exitCode=1;
}
