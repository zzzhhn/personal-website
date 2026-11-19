import {loadPlaywright,CHROME}from'../playtest/lib.mjs';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const {chromium}=loadPlaywright();
const traceMode=process.env.FACTORY_CONTACT_TRACE;
const contactTrace=traceMode==='1'||traceMode==='observe';
const routeOnly=process.env.FACTORY_ROUTE_ONLY==='1';
const qaStations=process.env.FACTORY_QA_STATIONS==='1';
const base=process.env.FACTORY_BASE_URL??'http://127.0.0.1:4361';
const out=path.resolve(process.env.FACTORY_OUT??'docs/world/factory-integration-20261114/evidence/factory-play');
fs.mkdirSync(out,{recursive:true});
const sourceRoot=path.resolve(process.env.FACTORY_SOURCE_ROOT??'.');
function hashes(){
  const files=process.env.FACTORY_SOURCE_ROOT
    ? ['src','public'].flatMap(dir=>fs.readdirSync(path.join(sourceRoot,dir),{recursive:true,withFileTypes:true})
        .filter(entry=>entry.isFile()).map(entry=>path.relative(sourceRoot,path.join(entry.parentPath,entry.name)))).sort()
    : execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','public'],{encoding:'utf8'}).trim().split('\n');
  return Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,file))).digest('hex')]));
}
const result={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceRoot,
  input:'keyboard/mouse/visible console buttons; module imports only observe live state',hashes:hashes(),errors:[],steps:[],actions:[],samples:[]};
const browser=await chromium.launch({headless:true,executablePath:CHROME}),ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),page=await ctx.newPage();let phase='startup',station='entrance';
const held=new Set(), traces=new Set();
if(contactTrace)result.contacts=[];
async function trace(name,op=null){
  if(!contactTrace)return;
  const operation=op ? op.phase+(op.action.type==='process'?' · '+(op.stroke>.6?'ram-down':op.guard>.7?'guard-down':'start'):'') : 'completed';
  const label=name+' · '+operation;if(traces.has(label))return;traces.add(label);
  const rows=await page.evaluate(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const d=window.__worldDebug;
    const surveys=await Promise.all(['factory-live-mechanisms','factory-physical-trials','factory-completed-companion','factory-report-printer-contact']
      .map(root=>d.reviewCollisionSources(root)));
    return {
      meshes:surveys.flatMap(s=>s.meshes.map(({path,submitted,declaration,matrixWorld})=>({path,submitted,declaration,at:matrixWorld.slice(12,15)}))),
      colliders:surveys.flatMap(s=>s.colliders), inventory:d.reviewCollisionInventory(true),
    };
  });
  const active=rows.colliders.filter(c=>c.enabled&&!c.sensor&&c.groups!==0);
  const solid=new Set(rows.meshes.filter(m=>m.declaration?.policy==='solid').map(m=>m.declaration.surface));
  const gaps=rows.meshes.filter(m=>!m.declaration||m.submitted&&m.declaration.reason==='This production part is absent at the current step.').map(m=>m.path);
  const missing=[...solid].filter(id=>active.filter(c=>c.name===id).length!==1);
  const orphaned=active.filter(c=>!solid.has(c.name)).map(c=>c.name);
  const anchorSurfaces=/^factory-(raw-|ram-|guard-|assembly-jaw-|carrier-|transfer-magnet-contact)/;
  const poseDrift=rows.meshes.flatMap(mesh=>{
    const id=mesh.declaration?.surface;
    if(!id||!anchorSurfaces.test(id))return [];
    const c=active.find(collider=>collider.name===id);
    return c?[{id,distance:Math.hypot(...mesh.at.map((n,i)=>n-Object.values(c.translation)[i]))}]:[];
  });
  const maxPoseDrift=Math.max(0,...poseDrift.map(item=>item.distance));
  result.contacts.push({name,operation,progress:op?.progress,stroke:op?.stroke,guard:op?.guard,attached:op?.attached,
    coverage:{mounted:rows.meshes.length,submitted:rows.meshes.filter(m=>m.submitted).length,active:active.length,gaps,missing,orphaned,maxPoseDrift},rows});
  fs.writeFileSync(path.join(out,'contact-trace.json'),JSON.stringify(result.contacts,null,2));
  if(traceMode==='1'){
    assert.ok(rows.meshes.length>0,label+' mechanisms must be mounted');
    assert.ok(maxPoseDrift<.004,label+' live body/mesh positions diverged by '+maxPoseDrift);
    assert.deepEqual([...gaps,...missing,...orphaned],[],label+' collision source or supply gap');
    assert.deepEqual(rows.inventory.errors,[],label+' whole-world collision inventory');
    for(const scope of [rows.inventory.mounted,rows.inventory.submitted]){
      assert.equal(scope.unclassified+scope.invalid,0,label+' complete declarations');
    }
  }
}

page.on('pageerror',e=>result.errors.push({phase,error:e.message}));const delay=ms=>page.waitForTimeout(ms);
async function read(){return page.evaluate(()=>{const b=window.__factoryBot,w=b.world.getState(),f=b.f.useFactoryStore.getState(),a=b.actor.snapshot();return{p:a.player,v:a.playerVelocity,grounded:a.grounded,camera:b.actor.camera(),near:w.nearbyInteract?.id,station:w.factoryStation,paused:w.paused,ready:w.ready,game:f.game,phase:f.phase,aligned:f.aligned,op:b.f.factoryControl.operation,inspection:b.f.factoryControl.inspection,dispatch:f.dispatchView,print:f.printSequence};});}
async function keys(ks=[]){const want=new Set(ks);for(const k of held)if(!want.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
async function capture(name){await keys();const s=await read();result.steps.push({name,...s});await page.screenshot({path:path.join(out,name+'.png')});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2));console.log(name,JSON.stringify({p:s.p,station:s.station,phase:s.phase,pending:s.game.pending?.action,history:s.game.history.length,trials:s.game.trials.map(t=>({mode:t.mode,status:t.status,n:t.samples.length})),released:s.game.released}));}
async function moveTo(target,tol=.25){phase='walk '+target;const start=Date.now();let best=Infinity,progress=Date.now();while(Date.now()-start<60000){const s=await read();if(result.errors.length)throw Error('runtime error');const dx=target[0]-s.p[0],dz=target[1]-s.p[2],dist=Math.hypot(dx,dz);result.samples.push({at:Date.now(),p:s.p,target,...(routeOnly&&{velocity:s.v,grounded:s.grounded,camera:s.camera,held:[...held],paused:s.paused})});if(dist<tol){await keys();await delay(130);return;}if(dist<best-.12){best=dist;progress=Date.now();}if(Date.now()-progress>6500){
    if(routeOnly)result.stall=await page.evaluate(p=>window.__worldDebug.physicsInventory().filter(c=>{
      const box=c.aabb;if(!box)return false;
      return box.min.every((v,i)=>v<=p[i]+1.2)&&box.max.every((v,i)=>v>=p[i]-1.2);
    }),s.p);
    throw Error('walk stalled '+JSON.stringify(s.p));
  }const yaw=Math.atan2(-dz,-dx),d=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));if(Math.abs(d)>.04){await keys();await page.mouse.move(960,540);await page.mouse.down();await page.mouse.move(960+d/.0055,540,{steps:2});await page.mouse.up();}await keys(['w']);await delay(dist<1?50:120);}throw Error('walk timeout');}
async function route(ps){for(const p of ps)await moveTo(p);}
async function at(id){
  if((await read()).station){await page.keyboard.press('Escape');await delay(160);}
  if(qaStations){
    // Place near the published console; the real offer, E and approach still run.
    const found=await page.evaluate(async id=>{
      const d=window.__worldDebug;
      const row=window.__worldInteract.list().find(r=>r.id==='factory-'+id);
      if(!row)return null;
      for(const [dx,dz] of [[0,0],[0,.56],[.56,0],[0,-.56],[-.56,0],[0,1.04],[1.04,0],[0,-1.04],[-1.04,0]]){
        const p=[row.position[0]+dx,row.position[1]+.65,row.position[2]+dz];
        if(!d.teleportPlayer(p))continue;d.set({position:p});
        await new Promise(resolve=>setTimeout(resolve,800));
        if(d.snapshot().grounded&&d.state().nearbyInteract?.choices.some(c=>c.id===row.id))return p;
      }
      return null;
    },id);
    if(!found)throw Error('No grounded offered QA stance for '+id);
    result.steps.push({name:'qa-stance-'+id,p:found});
  }else{
    const pts=await page.evaluate(({from,to})=>window.__factoryBot.nav.factoryWalkingRoute(from,to).map(p=>window.__factoryBot.layout.factoryWorld(p)),{from:station,to:id});
    await route(pts.map(p=>[p[0],p[2]]));
  }
  station=id;
  for(let i=0;i<8;i++){
    const s=await read();if(s.near==='factory-'+id){await page.keyboard.press('e');break;}
    await page.keyboard.press('q');await delay(180);
  }
  await page.waitForFunction(id=>window.__factoryBot.world.getState().factoryStation===id,id,{timeout:20000});
  await page.waitForFunction(id=>{const b=window.__factoryBot,p=b.actor.snapshot().player,s=b.layout.factoryWorld(b.layout.factoryStation(id).at);return Math.hypot(p[0]-s[0],p[2]-s[2])<.15;},id,{timeout:20000});
  await capture('at-'+id+'-'+result.actions.length);
}
async function execute(match,name){phase=name;await keys();const choice=await page.evaluate(match=>{const b=window.__factoryBot,s=b.f.useFactoryStore.getState(),id=b.world.getState().factoryStation,a=b.f.factoryStationActions(s.game,id).find(a=>Object.entries(match).every(([k,v])=>k==='testKind'?a.conditions?.testKind===v:a[k]===v));return a?{a,label:b.copy.factoryActionLabel(a,b.world.getState().lang==='zh')}:null;},match);if(!choice)throw Error('No action '+JSON.stringify(match));await page.getByRole('button',{name:choice.label,exact:true}).click();await page.waitForFunction(()=>window.__factoryBot.f.useFactoryStore.getState().game.pending,{},{timeout:5000});let screenshot=false,lastConfirm=0;const started=Date.now();while(Date.now()-started<160000){const s=await read();if(result.errors.length)throw Error('runtime error');if(!s.game.pending){await keys();await trace(name);result.actions.push({name,action:choice.a,ms:Date.now()-started,last:s.game.history.at(-1),trials:s.game.trials.map(t=>({id:t.id,mode:t.mode,status:t.status,samples:t.samples.length}))});await capture('done-'+name);return;}
const op=s.op;if(!op)throw Error('Missing operation');await trace(name,op);if(op.action.type==='test'){if(!screenshot&&s.game.trials.at(-1)?.samples.length>12){await capture('motion-'+name);screenshot=true;}await delay(250);continue;}
if(op.action.type==='inspect'){if(Date.now()-lastConfirm>750){await page.keyboard.press('e');lastConfirm=Date.now();}await delay(120);continue;}
if(op.action.type==='process'){await keys(['e']);if(!screenshot&&op.stroke>.7){await page.screenshot({path:path.join(out,'motion-'+name+'.png')});screenshot=true;}await delay(100);continue;}
if(op.phase==='aim'||op.phase==='carry'){const dx=op.target[0]-op.tool[0],dz=op.target[2]-op.tool[2],d=Math.hypot(dx,dz);if(d<.35){await keys();await page.keyboard.press('e');await delay(200);}else{await keys([...(Math.abs(dx)>.14?[dx>0?'d':'a']:[]),...(Math.abs(dz)>.14?[dz>0?'s':'w']:[])]);await delay(d<1?50:110);}}else{await keys();if(op.phase==='ready'&&Date.now()-lastConfirm>700){await page.keyboard.press('e');lastConfirm=Date.now();}await delay(120);}}
throw Error('operation timeout '+JSON.stringify(await read()));}
try{await page.addInitScript(()=>localStorage.setItem('lang','zh'));if(process.env.FACTORY_RESUME){const previous=JSON.parse(fs.readFileSync(process.env.FACTORY_RESUME,'utf8'));const point=process.env.FACTORY_RESUME_POINT;const saved=(point?previous.steps.find(s=>s.name===point):previous.steps.at(-1))?.game;if(!saved)throw Error('Unknown committed resume point');if(saved.pending)throw Error('Resume must use committed state');result.entry='Continuation from exactly observed committed state in '+process.env.FACTORY_RESUME+'; QA initial factory arrival then real input';result.resumeGameHash=createHash('sha256').update(JSON.stringify(saved)).digest('hex');await page.addInitScript(saved=>localStorage.setItem('bobby.factory.v1',JSON.stringify(saved)),saved);}const entry=new URL('/world/',base);
if(contactTrace||qaStations||routeOnly)entry.searchParams.set('qa','1');
if(process.env.FACTORY_RESUME||process.env.FACTORY_QA_ENTRY==='1')entry.searchParams.set('start','factory');
result.entry={
  location:entry.searchParams.has('start')?'published factory appearance position through start=factory':'ordinary camp appearance position',
  diagnostics:entry.searchParams.has('qa')?'QA read-only scene inspection':'none',
  movement:qaStations?'QA position near each console, then real E and operations':'continuous keys and mouse, no position changes from QA',
  progress:process.env.FACTORY_RESUME?'reload committed progress recorded in an earlier run':'fresh local progress',
};
const response=await page.goto(entry.href,{waitUntil:'domcontentloaded',timeout:90000});assert.ok(response?.ok());result.entryUrl=entry.href;result.entrySha256=createHash('sha256').update(await response.body()).digest('hex');await page.evaluate(async()=>{const [actor,w,f,layout,nav,copy]=await Promise.all([import('/src/components/world/WorldActors.tsx'),import('/src/components/world/store.ts'),import('/src/components/world/factory/factory-store.ts'),import('/src/components/world/factory/factory-layout.ts'),import('/src/components/world/factory/factory-navigation.ts'),import('/src/components/world/factory/factory-copy.ts')]);window.__factoryBot={actor:actor.worldActorDebug,world:w.useWorldStore,f,layout,nav,copy};});await page.waitForFunction(()=>window.__factoryBot.world.getState().ready&&window.__factoryBot.actor.snapshot().player,{},{timeout:120000});await page.mouse.click(900,500);await capture('00-camp');if(!entry.searchParams.has('start'))await route([[-40,38],[-33,38],[-29,37],[-21,37],[-14,32],[-5,29],[-4,4],[-4,-12],[-30,-27],[-88,-27],[-113,-27],[-139,-24],[-149,-17]]);await capture('01-factory-entrance');
if(traceMode==='1'){
  // The public entry can ready the player while other scene chunks are still mounting.
  await page.waitForFunction(()=>{
    const d=window.__worldDebug, report=d.reviewCollisionInventory(true);
    return d.actor().loaded && report.submitted.meshes > 0 && !report.errors.length && !report.mounted.unclassified
      && !report.mounted.invalid && !report.submitted.unclassified && !report.submitted.invalid;
  },null,{timeout:60000,polling:250});
}
await trace('initial');
if(routeOnly){
  assert.ok(!qaStations,'Route proof must use continuous keys between consoles');
  await at('routing');await at('frame');await page.keyboard.press('Escape');
  await capture('route-walk-restored');result.complete=true;
}else{
if(!process.env.FACTORY_RESUME){await at('raw');for(const module of ['frame','wheels','shell'])await execute({type:'extract',module},'extract-'+module);
await at('batch');await execute({type:'group',config:'steady'},'group-steady');await at('routing');for(const module of ['frame','wheels','shell'])await execute({type:'route',module,line:module},'route-'+module);}
if(process.env.FACTORY_RESUME_AT!=='finish'){
for(const module of ['frame','wheels','shell']){await at(module);await execute({type:'process',module},'process-'+module);}
await at('assembly');await execute({type:'trial-assemble'},'trial-assemble');await at('test');await execute({type:'test',mode:'single',testKind:'slope'},'single-slope');await at('compare');await execute({type:'test',mode:'comparison',testKind:'slope'},'comparison-slope');
await at('rework');await execute({type:'rework',module:'wheels',config:'nimble'},'rework-wheels');await at('routing');await execute({type:'route',module:'wheels',line:'wheels'},'reroute-wheels');await at('wheels');await execute({type:'process',module:'wheels'},'remanufacture-wheels');await at('assembly');await execute({type:'trial-assemble'},'reassemble');await at('test');await execute({type:'test',mode:'single',testKind:'slope'},'retest-single');await at('compare');await execute({type:'test',mode:'comparison',testKind:'slope'},'retest-comparison');
}
await at('finish');await execute({type:'final-assemble'},'fit-shell');await execute({type:'inspect'},'inspect');await at('release');await execute({type:'release'},'release');await page.getByRole('button',{name:'打印产品卡',exact:true}).click();await delay(2200);await capture('printed-card');await trace('printed-card');await page.getByRole('button',{name:'开始下一批',exact:true}).click();await delay(500);await capture('archived-next-batch');await trace('archived-next-batch');const final=await read();if(final.game.archives.length!==1||final.game.report!==null)throw Error('Archive failed');await page.keyboard.press('Escape');await delay(200);await moveTo([-154.5,40.3]);await capture('free-after-factory');result.complete=true;}
}catch(e){result.complete=false;result.failure={phase,error:String(e)};console.log('FAIL',result.failure);try{await capture('failure');}catch{}process.exitCode=1;}finally{await keys();try{await ctx.storageState({path:path.join(out,'storage.json')});}catch{}result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(hashes());fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));await browser.close();}
