/** Post-push verification: published bytes + one real browser load, no repeated route suite. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPlaywright,CHROME,Bot,canvasFacts,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const base=process.env.WORLD_BASE_URL;
if(!base)throw new Error('WORLD_BASE_URL is required');
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/preview';await mkdir(out,{recursive:true});
const inventory=JSON.parse(await readFile('docs/world/assets-v1.json','utf8'));
const report={base,checkedAt:new Date().toISOString(),commit:process.env.WORLD_COMMIT,assets:[],errors:[],httpErrors:[]};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
try{
 const response=await page.goto(base+'/world/?qa=1',{waitUntil:'domcontentloaded',timeout:90000});report.pageStatus=response.status();await page.waitForFunction(()=>window.__worldDebug?.actor().loaded,undefined,{timeout:90000});await page.waitForTimeout(1000);
 report.assets=await Promise.all(inventory.filter(a=>a.production?.glb&&a.production?.sha256).map(async a=>{const url=base+'/'+a.production.glb.replace(/^public\//,'');const response=await page.request.get(url);const digest=createHash('sha256').update(await response.body()).digest('hex');return {id:a.id,status:response.status(),sha256:digest,matches:digest===a.production.sha256};}));
 report.runtime=await page.evaluate(()=>({actor:__worldDebug.actor(),render:__worldDebug.renderInfo(),campShapes:__worldDebug.campColliders().length,snapshot:__worldDebug.snapshot()}));
 await page.screenshot({path:out+'/published-default.png'});
 report.passed=report.pageStatus===200&&report.assets.every(a=>a.status===200&&a.matches)&&report.runtime.actor.loaded&&!report.errors.length&&!report.httpErrors.length;
 if(process.env.WORLD_CANDIDATE==='1'){
  await page.goto(base+'/world/?qa=1&qaPhase=1&qaStop=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);await page.waitForTimeout(500);
  report.candidate=await page.evaluate(()=>{const a=__worldDebug.actor();return {loaded:a.loaded,phasePrototype:a.phasePrototype,stopPrototype:a.stopPrototype}});
  // The former candidate URL remains compatible after normal-entry acceptance.
  report.passed&&=report.runtime.actor.phasePrototype===true&&report.runtime.actor.stopPrototype===true&&report.candidate.phasePrototype===true&&report.candidate.stopPrototype===true&&!report.errors.length&&!report.httpErrors.length;
 }
 if(process.env.WORLD_DEFAULT_MOTION==='1'){
  // Record the real public entry without the QA API or any motion feature flags.
  report.passed&&=report.runtime.actor.phasePrototype===true&&report.runtime.actor.stopPrototype===true;
  const response=await page.goto(base+'/world/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>!!document.querySelector('main.world-app canvas')&&!document.querySelector('.world-loading'),undefined,{timeout:90000});await page.waitForTimeout(1500);
  const motion=report.defaultMotion={url:page.url(),pageStatus:response.status(),qaApiAbsent:await page.evaluate(()=>!window.__worldDebug),render:await canvasFacts(page),phases:[],video:'default-entry-stop.webm',fixtureCalls:[]};
  const bot=new Bot(page);const started=await startCanvasRecording(page,60);
  for(const [label,keys,ms] of [['idle',[],1000],['walk',['KeyA'],2000],['run',['KeyA','ShiftLeft'],1300],['walk-return',['KeyA'],1200],['stop',[],2000],['turn180',['KeyD'],1000],['stop180',[],2000]]){
   await bot.hold(keys);motion.phases.push({label,keys,videoTime_s:(Date.now()-started)/1000,duration_ms:ms});await page.waitForTimeout(ms);
  }
  await bot.release();motion.fixtureCalls=bot.fixtureCalls;await stopCanvasRecording(page,out+'/'+motion.video);await page.screenshot({path:out+'/default-entry-stop.png'});
  motion.passed=motion.pageStatus===200&&new URL(motion.url).search===''&&motion.qaApiAbsent&&motion.render.drawingBuffer[0]>=1920&&motion.render.drawingBuffer[1]>=1080;
  report.passed&&=motion.passed&&!report.errors.length&&!report.httpErrors.length;
 }
}catch(e){report.errors.push(e.stack||String(e));report.passed=false}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({base,passed:report.passed,assetCount:report.assets.length,errors:report.errors,httpErrors:report.httpErrors},null,2));if(!report.passed)process.exitCode=1;}
