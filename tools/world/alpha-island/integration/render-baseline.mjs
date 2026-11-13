import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(process.env.ALPHA_PLAYWRIGHT_PACKAGE??'/tmp/alpha-scene-browser/package.json'),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.ALPHA_CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const out=path.resolve('docs/world/alpha-island/integration/evidence/performance');fs.mkdirSync(out,{recursive:true});
const runs=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const native=process.env.ALPHA_PERF_BASE??'http://127.0.0.1:4354',candidate=process.env.ALPHA_PERF_CANDIDATE??'http://127.0.0.1:4355';
for(const [variant,base] of [['baseline',native],['candidate',candidate],['candidate',candidate],['baseline',native]]){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.__perfRenderers=[];window.__THREE_DEVTOOLS__=new EventTarget();window.__THREE_DEVTOOLS__.addEventListener('observe',e=>{if(e.detail?.isWebGLRenderer)window.__perfRenderers.push(e.detail);});});
 const start=Date.now();await p.goto(base+'/world/?qa=1&quality=balanced',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.__worldDebug?.state().ready,{},{timeout:120000});const readyMs=Date.now()-start;
 await p.evaluate(()=>{window.__worldDebug.set({light:'noon',worldMinutes:720,timeRevision:100,timeRunning:false});});await sleep(4000);
 const data=await p.evaluate(async()=>{const slow=[],values=[];let last;const start=performance.now();await new Promise(resolve=>{const frame=now=>{if(last!==undefined){const dt=now-last;values.push(dt);if(dt>50)slow.push({at:now-start,ms:dt});}last=now;if(now-start<10000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});values.sort((a,b)=>a-b);const q=n=>values[Math.min(values.length-1,Math.floor(values.length*n))];const d=window.__worldDebug;return{n:values.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over50:slow.length,slow,stats:d.stats(),render:d.renderInfo(),state:{ready:d.state().ready,loading:d.state().loading},ua:navigator.userAgent};});
 const row={variant,base,readyMs,errors,...data};runs.push(row);console.log(JSON.stringify({variant,readyMs,p50:row.p50,p95:row.p95,max:row.max,calls:row.stats.calls,tris:row.stats.triangles}));await context.close();fs.writeFileSync(path.join(out,'camp-abba.json'),JSON.stringify({machine:execFileSync('sysctl',['-n','machdep.cpu.brand_string'],{encoding:'utf8'}).trim(),note:'Production pages, same browser/version and 1080p Balanced camp noon. 10s includes unresolved loading work; not all-island acceptance or M3 certification.',runs},null,2));
}
await browser.close();
