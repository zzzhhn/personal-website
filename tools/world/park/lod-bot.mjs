/** Only LOD/new-geometry checks: no six-exhibit replay. Camera uses real mouse/wheel; teleports logged. */
import path from 'node:path';import{writeFile}from'node:fs/promises';
import{Bot,CHROME,loadPlaywright,openWorld}from'../playtest/lib.mjs';import{aim,look}from'../playtest/budget-lib.mjs';
const out=process.env.WORLD_PLAYTEST_DIR,r={runs:[],errors:[]};const b=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
try{
const{page,errors}=await openWorld(b,process.env.WORLD_BASE_URL+'/world/?qa=1',{width:1920,height:1080});await page.waitForFunction(()=>window.__parkLOD?.().length>=18&&window.__parkLodInstances?.().length>=2);await page.waitForTimeout(1500);await page.addStyleTag({content:'astro-dev-toolbar{display:none!important}'});const bot=new Bot(page);
const parkHandles=()=>page.evaluate(()=>__worldDebug.physicsInventory().filter(x=>String(x.assetId??'').startsWith('park')||/exhibit-|^rail$|^lamp$/.test(String(x.assetId??''))).map(x=>({handle:x.handle,assetId:x.assetId,shape:x.shape,aabb:x.aabb})));
r.physicsBefore=await parkHandles();
for(const view of [
{id:'near-park',p:[57,2.3,-42],yaw:look(8,18),pitch:.45,distance:18},
{id:'lod-transition',p:[26,2.3,-42],yaw:look(1,0),pitch:.8,distance:30},
{id:'far-park',shot:'park'},
{id:'return-near',p:[57,2.3,-42],yaw:look(8,18),pitch:.45,distance:18}
]){
if(view.shot) { await page.evaluate(shot=>__worldDebug.set({shot}),view.shot); await page.waitForTimeout(900); } else { await page.evaluate(()=>__worldDebug.set({shot:null})); await bot.fixtureTeleport(view.p,'LOD view '+view.id);await aim(page,{yaw:view.yaw,pitch:view.pitch,distance:view.distance}); } await page.waitForTimeout(700);
const lod=await page.evaluate(()=>__parkLOD()),instances=await page.evaluate(()=>__parkLodInstances());const frame=await page.evaluate(()=>__worldDebug.budget.frame());
r.runs.push({id:view.id,lod,instances,frame,stats:await page.evaluate(()=>__worldDebug.stats())});await page.screenshot({path:path.join(out,view.id+'.jpg'),type:'jpeg',quality:83});
}
r.physicsAfter=await parkHandles();r.colliderHandlesStable=JSON.stringify(r.physicsBefore.map(({handle,assetId,shape})=>({handle,assetId,shape})))===JSON.stringify(r.physicsAfter.map(({handle,assetId,shape})=>({handle,assetId,shape})));
r.staticRatioPass=r.runs.every(x=>x.lod.every(v=>v.ratio<=.3));r.distanceSwitchPass=r.runs.every(x=>x.lod.every(v=>v.level===(v.distance>=60?1:0)&&v.nearVisible===(v.level===0)&&v.farVisible===(v.level===1)));
r.instanceRatioPass=r.runs.every(x=>x.instances.every(v=>v.farTrianglesEach<=v.nearTrianglesEach*.3));
// One representative retained collider: walk into Alpha's rear wall after a far/near transition.
const h=await page.evaluate(()=>__parkWalk.huts.find(h=>h.id==='alpha-agent'));await bot.fixtureTeleport([h.anchor[0],2.3,h.anchor[2]],'Alpha retained collider after LOD return');await aim(page,{yaw:Math.atan2(.8,.6),pitch:.65,distance:8});
// Reset camera heading before Bot.walk's ordinary WASD mapping.
await aim(page,{yaw:Math.atan2(.8,.6),pitch:.65,distance:8});
r.wall=await bot.walk([[h.backOutside[0],h.backOutside[2]]],{timeout:3,stopOnBlocked:true,maxRecoveries:0});r.wallBlocked=!r.wall.legs[0].reached;r.fixtures=bot.fixtureCalls;r.errors=errors;
}catch(e){r.fatal=String(e.stack||e);}finally{await b.close();await writeFile(path.join(out,'lod-bot.json'),JSON.stringify(r,null,1));console.log(JSON.stringify({runs:r.runs.map(x=>({id:x.id,near:x.lod.filter(v=>v.level===0).length,far:x.lod.filter(v=>v.level===1).length,total:x.stats,park:x.frame?.byZone?.park})),staticRatioPass:r.staticRatioPass,distanceSwitchPass:r.distanceSwitchPass,instanceRatioPass:r.instanceRatioPass,colliderHandlesStable:r.colliderHandlesStable,wallBlocked:r.wallBlocked,fatal:r.fatal,errors:r.errors?.slice(0,6)}));}
