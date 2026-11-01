/** Normal-entry shadow evidence (spec v3 §4): walk past and drive past the camp desk/stool, 5 s 1080p clip each.
 * No query parameters, so no QA/debug API exists: every input is a real key (WASD, Shift, E) and the only
 * feedback is what a player sees in the HUD (minimap player dot, speed readout, interaction prompt).
 * No teleport, no fixtures. Records the actual entry URL, git HEAD and a hash of the world sources.
 * Usage: node normal-entry-desk.mjs [BASE] [OUTDIR]  (defaults: http://127.0.0.1:4322, docs/.../shadows/normal-entry) */
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import path from 'node:path';
import {loadPlaywright,CHROME,comboFor,startCanvasRecording,stopCanvasRecording} from './lib.mjs';
const base=process.argv[2]||process.env.WORLD_BASE_URL||'http://127.0.0.1:4322';
const out=process.argv[3]||process.env.WORLD_PLAYTEST_DIR||'docs/world/quality-v3/shadows/normal-entry';
await mkdir(out,{recursive:true});
const DESK=[-52.8,40.8]; // C07 desk+stool centre on pad index 3 (camp collider AABB centre)
const srcDir='src/components/world';
const files=(await readdir(srcDir)).filter(f=>/\.(tsx?|css)$/.test(f)).sort();
const h=createHash('sha256');for(const f of files){h.update(f);h.update(await readFile(path.join(srcDir,f)));}
const report={base,startedAt:new Date().toISOString(),source:{gitHead:execSync('git rev-parse HEAD').toString().trim(),dirty:execSync('git status --porcelain -- src/components/world').toString().trim().split('\n').filter(Boolean),worldSourcesSha256:h.digest('hex'),files:files.length},
 entryUrl:null,clips:[],steps:[],errors:[],limits:['HUD minimap position is published ~11 Hz and rounded by the SVG; it steers the bot, it is not a measurement.','Headless Chrome (Metal ANGLE) on M5 Pro; no M1 claim.','Clip is canvas-only (HUD not included).']};
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.routeWebSocket('**/*',ws=>ws.close()); // keep this run on the code it loaded (no HMR swap mid-clip)
page.on('pageerror',e=>report.errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`)});
// Resource failures are logged with their URL by the response handler above; skip the URL-less console echo.
page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('[vite]')&&!m.text().startsWith('Failed to load resource'))report.errors.push(m.text())});
const held=new Set();
async function hold(keys){const next=new Set(keys);for(const k of [...held])if(!next.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of next)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
const hud=()=>page.evaluate(()=>{
 const dot=document.querySelector('aside.world-location svg circle[r="2.6"]');
 const speed=document.querySelector('.world-speed strong');
 return {p:dot?[+dot.getAttribute('cx'),+dot.getAttribute('cy')]:null,kmh:speed?+speed.textContent:null,driving:!!speed,prompt:document.querySelector('.world-interaction span')?.textContent??null,t:performance.now()};
});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
async function walkTo(target,{arrive=.8,timeout=12,run=false}={}){
 const t0=Date.now();let s=await hud();
 while(Date.now()-t0<timeout*1000){s=await hud();if(!s.p)break;const dx=target[0]-s.p[0],dz=target[1]-s.p[1];if(Math.hypot(dx,dz)<arrive)break;
  await hold([...comboFor(dx,dz).keys,...(run?['ShiftLeft']:[])]);await page.waitForTimeout(40);}
 await hold([]);s=await hud();
 const ok=!!s.p&&dist(s.p,target)<arrive+.6;report.steps.push({walkTo:target,reached:ok,at:s.p,seconds:(Date.now()-t0)/1000});return ok;
}
async function clip(name,fn){
 const file=path.join(out,name+'.webm');const start=await hud();
 await startCanvasRecording(page,30);const t0=Date.now();const track=[];
 await fn(track,t0);
 await stopCanvasRecording(page,file);
 const closest=Math.min(...track.map(r=>dist(r.p,DESK)));
 const c={name,file,seconds:(Date.now()-t0)/1000,start:start.p,closestToDeskCentre_m:closest,track};
 report.clips.push(c);await page.screenshot({path:path.join(out,name+'-end.png')});return c;
}
try{
 await page.goto(base+'/world/',{waitUntil:'networkidle',timeout:60000});
 report.entryUrl=page.url();
 report.debugApiPresent=await page.evaluate(()=>'__worldDebug' in window);
 await page.waitForFunction(()=>!document.querySelector('.world-loading')&&document.querySelector('aside.world-location svg circle[r="2.6"]'),undefined,{timeout:90000});
 await page.waitForTimeout(1500);
 report.spawn=(await hud()).p;
 // Walk: around the east bench, then west past the desk at ~2 m (z 38.5), 5 s clip.
 if(!await walkTo([-42.5,38.6]))throw new Error('could not reach walk start');
 await clip('walk-past-desk',async(track,t0)=>{
  while(Date.now()-t0<5000){const s=await hud();track.push({t:(Date.now()-t0)/1000,p:s.p});const dx=-58-s.p[0],dz=38.6-s.p[1];await hold(Math.abs(dx)>.8?comboFor(dx,dz).keys:[]);await page.waitForTimeout(40);}
  await hold([]);
 });
 // Drive: walk to the 4x4 in its exit bay (faces east), E, slow right-hand U-turn on the bay/road apron, back in
 // through the gap between pads 1 and 2, then a ring of radius 11 around the camp centre (between the benches at
 // r~6 and the pad stand-ins at r=15) past the desk (~4 m at 135 deg). Real W/A/D/Space only; heading from minimap.
 for(const w of [[-42.5,38.6],[-33,38.6],[-27,37]])if(!await walkTo(w,{timeout:10}))throw new Error('could not reach car at '+w);
 let s=await hud();report.steps.push({atCar:s.p,prompt:s.prompt});
 await page.keyboard.press('KeyE');await page.waitForTimeout(500);s=await hud();
 report.steps.push({afterE:{driving:s.driving,prompt:s.prompt}});
 if(!s.driving)throw new Error('E did not enter a vehicle (prompt: '+s.prompt+')');
 const C=[-42,30],R=11;
 const ring=[90,105,120,135,150,165,180,195].map(a=>[C[0]+R*Math.cos(a*Math.PI/180),C[1]+R*Math.sin(a*Math.PI/180)]);
 const uturn=[[-21,36],[-19.6,40.4],[-21.6,44.4],[-26,45.5],[-33,43],[-39.2,40.6]];
 const path0=[...uturn,...ring];
 report.drivePath=path0;
 let prev=null,heading=null,wp=0;const driveTrack=[];
 async function drive(until){
  while(!until()){
   s=await hud();if(!s.p)break;driveTrack.push({t:Date.now(),p:s.p,kmh:s.kmh});
   if(prev&&dist(prev,s.p)>.15){heading=Math.atan2(s.p[1]-prev[1],s.p[0]-prev[0]);prev=s.p;}else if(!prev)prev=s.p;
   while(wp<path0.length-1&&dist(s.p,path0[wp])<3)wp++;
   const target=path0[wp];let steer=[];
   if(heading!==null){let e=Math.atan2(target[1]-s.p[1],target[0]-s.p[0])-heading;e=Math.atan2(Math.sin(e),Math.cos(e));
    // A = positive steering = yaw about +Y, which turns +X toward -Z: heading atan2(z,x) decreases.
    if(Math.abs(e)>.06)steer=[e<0?'KeyA':'KeyD'];}
   // Slow through the U-turn (tighter radius), ~5 m/s on the ring.
   const [lo,hi]=wp<uturn.length?[7,11]:[15,20];
   const kmh=s.kmh??0;const throttle=kmh<lo?['KeyW']:kmh>hi?['Space']:[];
   await hold([...throttle,...steer]);await page.waitForTimeout(40);
  }
 }
 const tStart=Date.now();
 await drive(()=>Date.now()-tStart>30000||(s.p&&dist(s.p,DESK)<11&&wp>=uturn.length));
 report.steps.push({driveApproach:{seconds:(Date.now()-tStart)/1000,at:s.p,waypoint:wp,ofWaypoints:path0.length}});
 if(!(s.p&&dist(s.p,DESK)<12))throw new Error('drive did not get near the desk; last '+JSON.stringify(s.p)+' waypoint '+wp);
 await clip('drive-past-desk',async(track,t0)=>{await drive(()=>{if(s.p)track.push({t:(Date.now()-t0)/1000,p:s.p,kmh:s.kmh});return Date.now()-t0>5000||wp>=path0.length-1&&dist(s.p,path0.at(-1))<2;});});
 await hold(['Space']);await page.waitForTimeout(600);await hold([]);
 report.driveTrack=driveTrack;
}catch(e){report.errors.push(e.stack||String(e));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 await hold([]).catch(()=>{});report.finishedAt=new Date().toISOString();
 report.summary={entryUrl:report.entryUrl,debugApiPresent:report.debugApiPresent,clips:report.clips.map(c=>({name:c.name,seconds:+c.seconds.toFixed(2),closestToDeskCentre_m:+c.closestToDeskCentre_m.toFixed(2)})),errors:report.errors};
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.summary,null,1));await browser.close();
 if(report.errors.length||report.clips.length<2)process.exitCode=1;
}
