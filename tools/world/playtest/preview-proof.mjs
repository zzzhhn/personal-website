/** Post-push verification: published bytes + one real browser load, no repeated route suite. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPlaywright,CHROME} from './lib.mjs';
const base=process.env.WORLD_BASE_URL;
if(!base)throw new Error('WORLD_BASE_URL is required');
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/preview';await mkdir(out,{recursive:true});
const inventory=JSON.parse(await readFile('docs/world/assets-v1.json','utf8'));
const report={base,checkedAt:new Date().toISOString(),commit:process.env.WORLD_COMMIT,assets:[],errors:[],httpErrors:[]};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
try{
 const response=await page.goto(base+'/world/?qa=1',{waitUntil:'networkidle'});report.pageStatus=response.status();await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);await page.waitForTimeout(1000);
 report.assets=await Promise.all(inventory.filter(a=>a.production?.glb&&a.production?.sha256).map(async a=>{const url=base+'/'+a.production.glb.replace(/^public\//,'');const response=await page.request.get(url);const digest=createHash('sha256').update(await response.body()).digest('hex');return {id:a.id,status:response.status(),sha256:digest,matches:digest===a.production.sha256};}));
 report.runtime=await page.evaluate(()=>({actor:__worldDebug.actor(),render:__worldDebug.renderInfo(),campShapes:__worldDebug.campColliders().length,snapshot:__worldDebug.snapshot()}));
 await page.screenshot({path:out+'/published-default.png'});
 report.passed=report.pageStatus===200&&report.assets.every(a=>a.status===200&&a.matches)&&report.runtime.actor.loaded&&!report.errors.length&&!report.httpErrors.length;
}catch(e){report.errors.push(e.stack||String(e));report.passed=false}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({base,passed:report.passed,assetCount:report.assets.length,errors:report.errors,httpErrors:report.httpErrors},null,2));if(!report.passed)process.exitCode=1;}
