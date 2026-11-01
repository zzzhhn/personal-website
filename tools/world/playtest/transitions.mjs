/** A3 focused real-key transitions at both user camera distances. No physics fixtures. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Bot,loadPlaywright,CHROME,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
import {footContactEvidence} from './foot-contact.mjs';
const out=process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v2/playtest/transitions';await mkdir(out,{recursive:true});
const captureSkin=process.env.WORLD_CAPTURE_SKIN==='1',stopPrototype=process.env.WORLD_STOP_PROTOTYPE==='1';
const phasePrototype=process.env.WORLD_PHASE_PROTOTYPE==='1';
const interruptions=process.env.WORLD_MOTION_INTERRUPTS==='1';
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const report={base:process.env.WORLD_BASE_URL||'http://127.0.0.1:4322',startedAt:new Date().toISOString(),interruptions,errors:[],views:[]};
function windowStats(samples,from,to,limit,arc=false){
 const rows=samples.filter(s=>s.t>=from&&s.t<=to).map(s=>({...s,label:'window'}));
 const contact=footContactEvidence(rows).includingTransitions.window??null;
 const first=rows[0]?.actor.root;
 const rootTranslation_m=first?Math.max(...rows.map(s=>Math.hypot(s.actor.root[0]-first[0],s.actor.root[2]-first[2]))):null;
 return {from,to,threshold_m:limit,metric:arc?'arc length':'displacement',contact,rootTranslation_m,
   passed:!!contact&&contact.continuousPairs>=2&&(arc?contact.maxIntervalArc_m:contact.maxIntervalDrift_m)<=limit};
}
try{for(const zoom of [1,0]){
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const bot=new Bot(page);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 const view={zoom,samples:[],phases:[],segments:{},events:[]};report.views.push(view);
 await page.goto(report.base+'/world/?qa=1'+(stopPrototype?'&qaStop=1':'')+(phasePrototype?'&qaPhase=1':''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__worldDebug?.actor().loaded);
 await page.evaluate(z=>__worldDebug.set({zoom:z}),zoom);await page.waitForTimeout(1000);
 const asset=await page.request.get(report.base+'/assets/world/guide/G24.glb');view.assetSha256=createHash('sha256').update(await asset.body()).digest('hex');
 view.stopPrototype=stopPrototype;
 view.phasePrototype=phasePrototype;
 if(captureSkin)view.skinTopology=await page.evaluate(()=>__worldDebug.actorSkin(true));
 view.recordingStart_s=((await startCanvasRecording(page,60))-bot.t0)/1000;
 async function phase(label,keys,ms){
   await bot.hold(keys);const start=bot.now();view.phases.push({label,keys,start,videoTime_s:start-view.recordingStart_s});
   while(bot.now()-start<ms/1000){view.samples.push({label,t:bot.now(),...await page.evaluate(capture=>({snapshot:__worldDebug.snapshot(),actor:__worldDebug.actor(),paused:__worldDebug.state().paused,...(capture?{skin:__worldDebug.actorSkin()}: {})}),captureSkin)});await page.waitForTimeout(16);}
 }
 if(interruptions){
   await phase('idle',[],500);
   // Interrupt while the helper is still settling, rather than wait for the
   // two-second completed-stop case to conceal the previous leg-twist defect.
   await phase('walk',['KeyA'],1200);await phase('pre-turn',[],420);
   await phase('turn180',['KeyD'],700);await phase('settled-turn',[],1700);
   await phase('walk-again',['KeyA'],900);await phase('pre-resume',[],360);
   await phase('resume',['KeyA'],650);await phase('pre-jump',[],400);
   await bot.press('Space');await phase('jump-land',[],1800);
   await phase('walk-pause',['KeyD'],850);await phase('pre-pause',[],400);
   await bot.press('Escape');await phase('paused',[],350);
   await bot.press('Escape');await phase('resumed-pause',[],1700);
 }else{
   await phase('idle',[],1000);await phase('walk',['KeyA'],2000);await phase('run',['KeyA','ShiftLeft'],1300);
   await phase('walk-return',['KeyA'],1200);await phase('stop',[],2000);
   await phase('turn180',['KeyD'],1000);await phase('stop180',[],2000);
 }
 await bot.release();
 await stopCanvasRecording(page,path.join(out,`zoom-${zoom}.webm`));await page.screenshot({path:path.join(out,`zoom-${zoom}.png`)});
 const samples=view.samples;view.footContact=footContactEvidence(samples);
 if(interruptions){
   const before=label=>samples.filter(s=>s.label===label).at(-1);
   view.segments['interrupted-active-stop']={passed:['pre-turn','pre-resume','pre-jump','pre-pause'].every(label=>before(label).actor.stop?.state==='settling'),
     states:Object.fromEntries(['pre-turn','pre-resume','pre-jump','pre-pause'].map(label=>[label,before(label).actor.stop?.state]))};
   const flight=samples.filter(s=>s.label==='jump-land');
   view.segments['jump-lands']={passed:flight.some(s=>!s.snapshot.grounded)&&flight.at(-1).snapshot.grounded&&flight.at(-1).actor.animation==='Idle'};
   view.segments['stop-completes']={passed:['settled-turn','resumed-pause'].every(label=>before(label).actor.stop?.state==='off')};
   const paused=samples.filter(s=>s.label==='paused'),p=paused[0].actor.root;
   view.segments['pause-freezes']={passed:paused.every(s=>s.paused===true)&&paused.every(s=>Math.hypot(...s.actor.root.map((v,i)=>v-p[i]))<.001)&&Math.abs(paused.at(-1).actor.mixerTime-paused[0].actor.mixerTime)<.001};
   const active=samples.filter(s=>s.actor.stop?.state!=='off');
   const boneError=Math.max(...active.flatMap(s=>['left','right'].map(k=>s.actor.stop[k].boneLengthError)));
   view.segments['bone-length-preserved']={passed:Number.isFinite(boneError)&&boneError<1e-5,maxError_m:boneError};
   view.phaseGateTimeouts=samples.at(-1).actor.phaseGateTimeouts;
   view.events=bot.events;view.fixtures=bot.fixtureCalls;
   view.passed=Object.values(view.segments).every(s=>s.passed);
   await page.close();continue;
 }
 for(const label of ['walk','run','walk-return']){
   const phaseRows=samples.filter(s=>s.label===label);const start=phaseRows[0].t;
   view.segments[`steady-${label}`]=windowStats(samples,start+.5,phaseRows.at(-1).t,.0172);
 }
 const walk=samples.filter(s=>s.label==='walk'),start=walk.find(s=>s.actor.speedMps>.1)?.t;
 view.segments.start=windowStats(samples,start??walk[0].t,walk[0].t+.5,.08);
 for(const label of ['stop','stop180']){
   const rows=samples.filter(s=>s.label===label);
   // Idle blending (and any subsequent settling step) continues after the rigid
   // body stops. Measure the entire released-key phase so that late foot movement
   // cannot disappear behind a velocity cutoff.
   view.segments[label]=windowStats(samples,rows[0].t,rows.at(-1).t,.08);
   view.segments[label].bodyStoppedAt=rows.find(s=>s.actor.speedMps<.05)?.t??null;
   view.segments[label].settleComplete=!stopPrototype || rows.at(-1).actor.stop?.state==='off';
   view.segments[label].passed&&=view.segments[label].settleComplete;
 }
 for(let i=1;i<samples.length;i++){
   const before=samples[i-1].actor.animation,after=samples[i].actor.animation;
   if((before==='Walk'&&after==='Run')||(before==='Run'&&after==='Walk'))
     view.segments[`${before}-${after}`]=windowStats(samples,samples[i].t-.2,samples[i].t+.3,.04);
 }
 // Include the last stationary sample before the turn; otherwise the first yaw
 // step would disappear from the measured arc. Stop at speed .5 m/s, per A3.
 for(const label of ['walk','turn180']){
   const first=samples.findIndex(s=>s.label===label),rows=samples.slice(Math.max(0,first-1));
   const end=rows.slice(1).find(s=>s.actor.speedMps>=.5)?.t??rows.at(-1).t;
   const turn=windowStats(samples,rows[0].t,end,.08,true);
   const last=samples.filter(s=>s.t<=end).at(-1);
   turn.yawChange_rad=Math.abs(Math.atan2(Math.sin(last.snapshot.playerYaw-rows[0].snapshot.playerYaw),Math.cos(last.snapshot.playerYaw-rows[0].snapshot.playerYaw)));
   // Fable 20:45: keep the measured sole rotation arc, judge turn translation
   // separately. Rotating a planted Idle pose is an explicit visual concession.
   turn.arcRecordedOnly=true;turn.threshold_m=null;turn.rootThreshold_m=.1;
   turn.passed=turn.rootTranslation_m!==null&&turn.rootTranslation_m<=.1&&turn.yawChange_rad>=Math.PI/2;
   view.segments[`turn-${label}`]=turn;
 }
 view.phaseGateTimeouts=samples.at(-1).actor.phaseGateTimeouts;
 view.events=bot.events;view.fixtures=bot.fixtureCalls;
 view.passed=Object.values(view.segments).every(s=>s.passed)&&(!phasePrototype||view.phaseGateTimeouts===0);await page.close();
 }}catch(e){report.errors.push(e.stack||String(e));}finally{
 report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
 console.log(JSON.stringify({errors:report.errors,views:report.views.map(v=>({zoom:v.zoom,sha:v.assetSha256,segments:Object.fromEntries(Object.entries(v.segments).map(([k,s])=>[k,{passed:s.passed,drift:s.contact?.maxIntervalDrift_m,arc:s.contact?.maxIntervalArc_m,root:s.rootTranslation_m,yaw:s.yawChange_rad}]))}))},null,2));
 if(report.errors.length||report.views.some(v=>!v.passed))process.exitCode=1;
}
