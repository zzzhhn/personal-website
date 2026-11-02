/** Verify the bounded ordinary-view evidence, not aesthetic quality or FPS. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT} from '../street/runtime.mjs';
const folder='docs/world/phase-2-playground/asset-batch6-20261103/bench-bin';
const read=file=>JSON.parse(readFileSync(path.join(ROOT,file),'utf8'));
const checks=[];
for(const family of ['bench','bin']){
  const stem=`${folder}/runtime-r1/${family}-normal-noon-`;
  const base=read(stem+'baseline.json'),candidate=read(stem+'candidate.json');
  for(const mode of ['baseline','candidate']){
    const data=mode==='baseline'?base:candidate;
    assert.equal(data.surfaceMode,mode);assert.equal(data.baseline,'ad7ee76');assert.equal(data.group,'bench-bin');
    assert.equal(data.view.id,family+'-normal');assert.deepEqual(data.canvas,[1710,931]);
    assert.equal(data.time,720);assert.equal(data.night,0);assert.equal(data.blend,1);
    assert.equal(data.exposure,1);assert.equal(data.fov,50);assert.equal(data.quality,'balanced');
    assert.equal(data.loading.active,false);assert.equal(data.loading.failed,0);assert.equal(data.shadow.pending,false);
    const jpeg=readFileSync(path.join(ROOT,stem+mode+'.jpg'));assert.equal(jpeg.subarray(0,3).toString('hex'),'ffd8ff');
  }
  assert.deepEqual(base.view,candidate.view);assert.deepEqual(base.registeredAssets,candidate.registeredAssets);
  const report=read(`public/assets/world/craft-batch6-bench-bin/${family}-export-report.json`);
  const source=readFileSync(path.join(ROOT,`tools/world/facility-craft/batch6/next-bench-bin/${family}.source.json`));
  assert.equal(report.sourceJSONSHA256,createHash('sha256').update(source).digest('hex'));
  assert.equal(report.freshBoundsDelta,0);assert.equal(report.triangles,family==='bench'?1328:2180);
  checks.push(`${family}: matched ordinary pair, settled gates, same asset sets, exact native source`);
}
assert.equal(read(`${folder}/runtime-r1/console-errors.json`).filter(item=>item.level==='error').length,0);
const files=[...readdirSync(path.join(ROOT,folder+'/runtime-r1')).filter(name=>name!=='manifest.json').map(name=>folder+'/runtime-r1/'+name),
  ...['bench','bin'].flatMap(family=>[`public/assets/world/craft-batch6-bench-bin/${family}-portable.glb`,
    `public/assets/world/craft-batch6-bench-bin/${family}-export-report.json`,`tools/world/facility-craft/batch6/native-bench-bin/${family}.blend`]),
  'astro.batch6.bench-bin.config.mjs','tools/world/facility-craft/batch6/next-bench-bin/review-views.json'];
const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(path.join(ROOT,file))).digest('hex')]));
const result={status:'ordinary R1 self-reviewed; bin improvement weak; not integration-ready',sourceCommit:'2c3f7a0c0e4b76ed20c3895d625172a87f298c13',checks,hashes};
writeFileSync(path.join(ROOT,folder+'/runtime-r1/manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks,hashedFiles:files.length,status:result.status}));
