/** Audit real input and results, using QA only to locate each production interaction on real ground. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import census from '../../../docs/world/foundation-20261117/interaction-census.json' with {type:'json'};
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [origin='http://127.0.0.1:4343',...selectors]=process.argv.slice(2);
const world=new URL('/world/',origin), errors=[], analytics=[], failures=[], ids=[];
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport={width:1056,height:700};
const emit=value=>console.log(JSON.stringify(value));
const exchangePrefix='alpha-exchange-';
const minePrefix='alpha-mine-';
const exchangeIds=['archive','desk','nudge-1','nudge--1','bell','clearing','review'].map(key=>exchangePrefix+key);
const mineIds=['vein-middle','vein-upper','pool-1','recovery-0','recovery-1','recovery-2'].map(key=>minePrefix+key);
const coasterIds=['intent-chest','intent-gate'];
async function fixtureHistory(route,requests){
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  assert.equal(route.request().method(),'POST');
  const {spec,direction,neutralize}=route.request().postDataJSON();
  requests.push(spec.name);
  const metrics={ic_spearman:.1,max_drawdown:-.2,turnover:.8,total_return:-.1,sharpe:-.4};
  const dates=Array.from({length:20},(_,i)=>'2026-01-'+String(i+1).padStart(2,'0'));
  await route.fulfill({status:200,headers:cors,json:{
    factor_name:spec.name,direction,benchmark_ticker:'SPY',neutralize,currency:'USD',
    survivorship_corrected:true,membership_as_of:'2026-01-14',train_end_index:16,
    equity_curve:dates.map((date,i)=>({date,value:100000-i*1000})),
    benchmark_curve:dates.map((date,i)=>({date,value:200000+i*1000})),
    train_metrics:{...metrics,n_days:14},test_metrics:{...metrics,ic_spearman:-.07,n_days:3},
  }});
}
async function open(page,url){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',line=>{
    if(line.type()!=='error')return;
    const source=line.location().url,message=line.text();
    if(source===new URL('/api/events',world).href&&/\b(404|501)\b/.test(message))analytics.push(message);
    else errors.push({source,message});
  });
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded'});
  assert.ok(response.ok());
  return createHash('sha256').update(await response.body()).digest('hex');
}

try{
  const ordinary=await browser.newPage({viewport});
  const entrySha256=await open(ordinary,world);
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();
  await ordinary.close();
  emit({route:'ordinary entry',entrySha256,browser:browser.version()});

  const page=await browser.newPage({viewport}), bot=new Bot(page);
  const historyRequests=[];
  await page.route('https://alpha-api.bobbyzhong.com/api/v1/factor/backtest',route=>fixtureHistory(route,historyRequests));
  await page.addInitScript(prepareCoaster=>{
    const buttons=Array.from({length:18},()=>({pressed:false,touched:false,value:0}));
    const pad={id:'Foundation families standard pad',mapping:'standard',connected:true,index:0,axes:[0,0,0,0],buttons,timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null]});
    window.familyPad=(i,pressed)=>Object.assign(buttons[i],{pressed,touched:pressed,value:Number(pressed)});
    if(prepareCoaster)localStorage.setItem('bobby-world.intent-coaster.progress.v1',JSON.stringify({
      version:1,bankRevision:'original-20261027-v1',passed:['T1','T2','T3','T4','T5','T6'],clarified:[],
      chestOpen:false,keyTaken:false,gateOpen:false,
    }));
  },!selectors.length||selectors.includes('coaster-locks')||coasterIds.some(id=>selectors.includes(id)));
  assert.equal(await open(page,new URL('?qa=1',world)),entrySha256);
  const wait=(fn,arg,timeout=18000)=>page.waitForFunction(fn,arg,{timeout,polling:80});
  await wait(()=>window.__worldDebug?.state().ready&&window.__worldDebug.snapshot().player,undefined,75000);
  await page.evaluate(()=>window.__worldDebug.set({lang:'en',timeRunning:false,light:'noon'}));
  function actor(){return page.evaluate(()=>{
    const d=window.__worldDebug,s=d.state(),a=d.snapshot();
    return {position:a.player,grounded:a.grounded,step:a.physicsStep,near:s.nearbyInteract?.id,choices:s.nearbyInteract?.choices.map(c=>c.id)??[],
      label:s.nearbyInteract?.label.en,card:s.card,seat:s.seat?.id??null,toast:s.toast,camp:window.__worldCampPropPlay?.(),
      clubMode:s.clubMode,danceStep:s.danceStep,factoryStation:s.factoryStation};
  });}
  async function frames(n){
    const target=(await actor()).step+n;
    const handle=await wait(target=>window.__worldDebug.snapshot().physicsStep>=target,target,12000);
    await handle.dispose();
  }
  async function pad(index){
    await frames(4);
    await page.evaluate(index=>window.familyPad(index,true),index);
    try{await frames(7);}finally{await page.evaluate(index=>window.familyPad(index,false),index);}
  }
  const key=(input,button='KeyE')=>input==='gamepad'?pad(3):page.keyboard.press(button);
  const inputStep=(input,operation,before,after,control=input==='gamepad'?'Y':'E')=>({input,control,operation,before,after});
  async function registerRow(id){
    const handle=await wait(id=>window.__worldInteract?.list().find(row=>row.id===id),id,35000);
    try{return await handle.jsonValue();}finally{await handle.dispose();}
  }
  async function relocate(position){
    assert.ok(await page.evaluate(p=>{
      const d=window.__worldDebug,ok=d.teleportPlayer(p);d.set({position:p});return ok;
    },position));
  }
  async function choose(id){
    const choices=(await actor()).choices.length;
    for(let i=0;i<choices&&(await actor()).near!==id;i++){await page.keyboard.press('KeyQ');await frames(3);}
    assert.equal((await actor()).near,id);
  }
  const around=[[0,0],...[.56,1.04].flatMap(r=>Array.from({length:8},(_,i)=>{
    const a=i*Math.PI/4;return [r*Math.cos(a),r*Math.sin(a)];
  }))];
  async function stand(id,{rise=.65,offsets=around,position}={}){
    const row=await registerRow(id),[x,y,z]=position??row.position;
    ids.push(id);
    for(const [dx,dz] of offsets){
      const fixture=[x+dx,y+rise,z+dz];
      await relocate(fixture);
      const reached=await wait(({id,p:[x,y,z]})=>{
        const d=window.__worldDebug,a=d.snapshot();
        return a.grounded&&Math.hypot(a.player[0]-x,a.player[2]-z)<.43&&Math.abs(a.player[1]-y)<2.2
          &&d.state().nearbyInteract?.choices.some(row=>row.id===id);
      },{id,p:fixture},1800).then(async handle=>{await handle.dispose();return true;},()=>false);
      if(reached){await choose(id);return {row,fixture,actor:await actor()};}
    }
    throw new Error(`No grounded, offered stance for ${id}: ${JSON.stringify(row)}`);
  }
  async function restored(id){
    await wait(id=>{
      const d=window.__worldDebug,s=d.state();
      return d.snapshot().grounded&&!s.card&&!s.seat&&s.nearbyInteract?.choices.some(row=>row.id===id);
    },id,11000);
    return actor();
  }
  const exhibitIds={tent:['identity'],desk:['education'],trophy:['awards'],flags:['languages'],tools:['skills'],
    guitar:['interests',0],dumbbell:['interests',1],wok:['interests',2],suitcase:['interests',3]};
  async function card(id,input){
    const at=await stand(id), kind=id.startsWith('town-')?'experience':id.startsWith('camp-')?'about':'project';
    await key(input);
    await page.locator('#world-card-title').waitFor({timeout:10000});
    const specific=(await actor()).card,title=(await page.locator('#world-card-title').innerText()).trim();
    assert.equal(specific?.kind,kind);
    if(kind==='experience'){
      const subtitle=(await page.locator('.world-card-subtitle').innerText()).trim();
      assert.equal(`${title} · ${subtitle}`,at.row.label.en);
    }
    if(id.startsWith('park-project-'))assert.equal(title,at.row.label.en.replace(/^Read /,''));
    if(id==='djc-club-project')assert.equal(specific.id,'djc');
    if(id==='alpha-exchange-project')assert.equal(specific.id,'alpha-agent');
    if(kind==='about'){
      const [expected,expectedPage]=exhibitIds[id.slice('camp-about-'.length)];
      assert.equal(specific.id,expected);assert.equal(specific.page,expectedPage);
    }
    await page.locator('.world-card-close').click();
    const after=await restored(id);
    return {fixture:at.fixture,events:[
      inputStep(input,'打开对应内容卡',{id,label:at.row.label.en},{...specific,title}),
      inputStep('panel','关闭内容卡并恢复提示',specific,{card:after.card,grounded:after.grounded,choices:after.choices},'close'),
    ]};
  }
  async function seat(id,input){
    const daybed=id.startsWith('djc-daybed-'), side=id.endsWith('-0')?-1:1;
    const at=await stand(id,daybed?{offsets:[[-side*.6,-.10],[-side*.6,-.27],...around]}:undefined);
    await key(input);
    await wait(id=>window.__worldDebug.state().seat?.id===id,id,10000);
    await frames(5);
    const seated=await actor();
    const exit=input==='keyboard'?'gamepad':'keyboard';
    await key(exit);
    await wait(()=>!window.__worldDebug.state().seat&&window.__worldDebug.snapshot().grounded,undefined,10000);
    const after=await actor();
    assert.ok(Math.abs(after.position[1]-at.actor.position[1])<(daybed?.25:.95),'standing stayed on the same floor');
    assert.ok(Math.hypot(after.position[0]-at.actor.position[0],after.position[2]-at.actor.position[2])<2.5,'standing stayed by this bench');
    return {fixture:at.fixture,events:[
      inputStep(input,'坐到指定座位',{near:at.actor.near,position:at.actor.position},{seat:seated.seat,position:seated.position}),
      inputStep(exit,'起身并在座位旁落地',{seat:seated.seat},{seat:after.seat,position:after.position,grounded:after.grounded}),
    ]};
  }
  const alternate=input=>input==='keyboard'?'gamepad':'keyboard';
  async function moveForward(){
    const before=await actor();
    await bot.hold(['KeyW']);
    try{await frames(24);}finally{await bot.release();}
    const after=await actor(), displacement=Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2]);
    return {before,after,displacement};
  }
  async function club(id,input){
    if(id.endsWith('-project'))return card(id,input);
    const at=await stand(id), mode=id.endsWith('-dance')?'dance':'dj';
    await key(input);
    await wait(mode=>window.__worldDebug.state().clubMode===mode,mode);
    const engaged=await actor(), events=[inputStep(input,'进入指定活动',{near:at.actor.near,clubMode:at.actor.clubMode},engaged)];
    if(mode==='dance'){
      const digit=engaged.danceStep===0?2:1;
      await page.keyboard.press('Digit'+digit);
      await wait(step=>window.__worldDebug.state().danceStep===step,digit-1);
      const changed=await actor();
      events.push(inputStep('keyboard','切换到另一个舞步',engaged,changed,String(digit)));
      const walked=await moveForward();
      assert.equal(walked.after.clubMode,null);
      assert.ok(walked.displacement>.15);
      events.push(inputStep('keyboard','离开舞池并恢复步行',walked.before,{...walked.after,displacement:walked.displacement},'W'));
    }else{
      const blocked=await moveForward();
      assert.equal(blocked.after.clubMode,'dj');
      assert.ok(blocked.displacement<.12);
      events.push(inputStep('keyboard','控制台仍占用输入，角色原地驻留',blocked.before,{...blocked.after,displacement:blocked.displacement},'W'));
      const exit=alternate(input);
      await key(exit);
      const after=await restored(id);
      assert.equal(after.clubMode,null);
      events.push(inputStep(exit,'离开 DJ 台并恢复场景提示',blocked.after,after));
    }
    return {fixture:at.fixture,events};
  }
  async function factory(id,input){
    await relocate([-234.5,2,-13.5]);
    const at=await stand(id), station=id.slice('factory-'.length), panel=page.locator('.factory-console');
    await key(input);
    await panel.waitFor({timeout:10000});
    assert.equal((await actor()).factoryStation,station);
    const opened={station,title:await panel.locator('h2').innerText(),
      purpose:await panel.locator(':scope > p').first().innerText(),
      actions:await panel.locator('.factory-actions button').allTextContents()};
    assert.equal(opened.title,at.row.label.en);
    const close=panel.getByRole('button',{name:'Leave console',exact:true});
    await close.click();
    await panel.waitFor({state:'hidden'});
    const after=await restored(id);
    assert.equal(after.factoryStation,null);
    return {fixture:at.fixture,events:[
      inputStep(input,'打开对应工位并读取当时可用动作',{near:at.actor.near,station:null},opened),
      inputStep('panel','退出工位并恢复场景提示',{station},{station:after.factoryStation,grounded:after.grounded,choices:after.choices},'Leave console'),
    ]};
  }
  async function exchangeRound(record){
    const read=()=>page.evaluate(()=>window.__worldExchange?.read());
    await relocate([59,2,-62]);
    const desk=(await registerRow(exchangePrefix+'desk')).position;
    async function action(short,input,operation,done,{position,loading=false,walk}={}){
      const id=exchangePrefix+short;
      let fixture;
      if(walk){
        const targets=walk.map(([x,z])=>[60+x,-55+z]);
        const walked=await bot.walk(targets,{arrive:.32,timeout:13,maxRecoveries:2});
        assert.equal(walked.legs.length,targets.length);
        assert.ok(walked.legs.every(leg=>leg.reached),JSON.stringify(walked.legs.at(-1)));
        await frames(12);
        await restored(id);
        await choose(id);
        fixture={walked:walked.legs};
      }else if((await actor()).choices.includes(id)){
        await choose(id);
        fixture=null;
      }else{
        fixture=(await stand(id,{position,rise:.89})).fixture;
      }
      const before=await read();
      await key(input);
      await wait(({contacts,loading})=>{
        const state=window.__worldExchange.read();
        if(loading&&state.notice==='error')throw new Error(state.error);
        return loading?state.notice==='history-ready':state.contacts===contacts+1;
      },{contacts:before.contacts,loading},14500).catch(async error=>{
        throw new Error(`${id} after ${input}: ${error.message}; round=${JSON.stringify(await read())}`);
      });
      // Actor actions commit at hand contact and finish before the next fixture move.
      if(!loading)await frames(52);
      const after=await read();
      assert.ok((await actor()).grounded);
      assert.ok(done(after,before),JSON.stringify({id,before,after}));
      record(id,fixture,[inputStep(input,operation,before,{...after,grounded:true,
        ...(loading&&{historyRequests:[...historyRequests]})})]);
    }
    await action('archive','keyboard','从档案台加载并校验回放用 SPY 曲线',s=>s.archive.some(t=>t.id==='full'&&t.days===20)&&historyRequests.includes('REVERSAL_5'),{loading:true});
    await action('archive','gamepad','重新操作档案台并领取完整历史票',s=>s.phase==='ticket'&&s.ticketId==='full'&&!s.ticketReturned);
    await action('desk','keyboard','持票走到中央台并插入票槽',s=>s.phase==='selecting',
      {walk:[[-11.7,-16],[-9.4,-16],[-9.4,-9],[-3,-9],[-3,-12.95],[-2,-14.4],[-1.35,-14.4]]});
    await action('nudge-1','gamepad','向右拨动一档并增加 10 份',s=>s.targetUnits===10,{position:desk});
    await action('nudge--1','keyboard','向左拨动一档并减少 10 份',s=>s.targetUnits===0,{position:desk});
    await action('nudge-1','keyboard','为第一段重新拨到 10 份',s=>s.targetUnits===10,{position:desk});
    for(let i=0;i<3;i++){
      await action('desk',i===1?'gamepad':'keyboard','将当前选择封单',s=>s.phase==='sealed');
      await action('bell',i===1?'keyboard':'gamepad','拉铃推进一个真实结算区间',(s,b)=>
        s.checkpoint===b.checkpoint+1&&s.day>b.day&&s.choices.length===i+1);
    }
    await action('clearing','keyboard','压印并领取三段回放的回执',s=>s.phase==='complete'&&s.receipt?.choices===3&&Number.isFinite(s.receipt.finalEquity));
    await action('review','gamepad','在楼上拨动复盘台并显示第一段',s=>s.reviewIndex===0&&s.phase==='complete');
  }
  async function mineRound(record){
    const source=await page.request.get(new URL('/world/alpha-mine/layout.json',world).href);
    assert.ok(source.ok());
    const {veins}=await source.json();
    const mineWorld=([x,y,z])=>[x-84,y+1.14,z-55];
    const factors=['REVERSAL_5','ROC20_RANK','LOW_STD_20'];
    const held='FOLLOW THE NEEDLE TO THE POOL';
    const read=()=>page.evaluate(()=>{
      const d=window.__worldDebug,s=d.state(),a=d.snapshot();
      return {position:a.player,grounded:a.grounded,id:s.nearbyInteract?.id,label:s.nearbyInteract?.label.en,
        choices:s.nearbyInteract?.choices.map(row=>({id:row.id,label:row.label.en})),
        command:document.querySelector('.mine-command')?.textContent,notice:document.querySelector('.mine-notice')?.textContent,
        state:JSON.parse(document.querySelector('[data-alpha-mine-qa]')?.textContent??'null')};
    });
    async function prompt(id,label){
      await wait(({id,label})=>window.__worldDebug.state().nearbyInteract?.choices
        .some(row=>row.id===id&&row.label.en.includes(label)),{id,label},12500);
      await choose(id);
    }
    async function command(label){
      await wait(label=>document.querySelector('.mine-command')?.textContent===label,label,13500);
    }
    async function forwardToFace(){
      await bot.hold(comboFor(0,-1).keys);
      try{await frames(9);}finally{await bot.release();}
      await frames(7);
    }
    await relocate(mineWorld([0,.9,0]));
    const tools=minePrefix+'tools';
    await stand(tools,{position:mineWorld([-9.16,0,-2.36]),rise:.9});
    await prompt(tools,'Collect detector');
    await key('keyboard');
    await prompt(tools,'Begin a fresh exploration');
    for(const [i,vein] of veins.entries()){
      const id=minePrefix+vein.id, factor=factors[i], recovery=minePrefix+'recovery-'+i;
      const [x,y,z]=mineWorld(vein.stand);
      const at=await stand(id,{position:[x,y,z+.18],rise:.89});
      await forwardToFace();
      const events=[];
      const scan=i===1?'gamepad':'keyboard';
      await prompt(id,'Read this seam');
      const before=await read();
      await key(scan);
      await prompt(id,'0/3');
      events.push(inputStep(scan,'读出对应矿缝并启用挥镐',before,await read()));
      for(let hit=1;hit<=3;hit++){
        const input=hit%2===1?'keyboard':'gamepad',before=await read();
        await key(input);
        await prompt(id,hit<3?hit+'/3':'Pick up');
        events.push(inputStep(input,'击中同一岩面，挥镐计数 '+hit,before,await read()));
      }
      const pickup=await read();
      await key('keyboard');
      await command(held);
      const carried=await read();
      if(carried.state)assert.equal(carried.state.carried,factor);
      events.push(inputStep('keyboard','拾取露出的矿石，仪表切换至持矿',pickup,carried));
      if(i>0)record(id,at.fixture,events);

      const pool=minePrefix+'pool-1';
      const bayRow=await registerRow(pool), bayPosition=[bayRow.position[0],1.14,bayRow.position[2]+.58];
      const bay=await stand(pool,{position:bayPosition,rise:.88});
      await prompt(pool,'Cast into B');
      const castBefore=await read();
      const cast=i%2===0?'gamepad':'keyboard';
      await key(cast);
      const chart='brain-online-result-1-'+factor;
      await wait(chart=>window.__worldDebug.sceneObjects().includes(chart),chart,18000);
      const castAfter=await read();
      assert.ok(castAfter.grounded&&castAfter.command!==held);
      assert.ok(historyRequests.includes(factor));
      if(castAfter.state)assert.equal(castAfter.state.bays[1],factor);
      record(pool,bay.fixture,[inputStep(cast,'投入 B 位并生成该矿石的曲线',castBefore,{...castAfter,chart,historyRequests:[...historyRequests]})]);

      const shelf=await stand(recovery);
      await prompt(recovery,'Retrieve');
      const retrieveBefore=await read(), retrieve=i%2===0?'keyboard':'gamepad';
      await key(retrieve);
      await command(held);
      const retrieved=await read();
      assert.ok(retrieved.grounded);
      if(retrieved.state)assert.equal(retrieved.state.carried,factor);
      assert.ok(!(await registerRow(recovery)).enabled);
      record(recovery,shelf.fixture,[inputStep(retrieve,'从该回收台重新拾起已计算的同一块矿石',retrieveBefore,retrieved)]);

      if(i<veins.length-1){
        // Release the recovered ore by recasting it. Cast and recovery themselves always use real input.
        await stand(pool,{position:bayPosition,rise:.88});
        await prompt(pool,'Cast into B');
        await key('keyboard');
        await prompt(pool,'Inspect results');
      }
    }
  }
  async function coasterLocks(record){
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bobby-world.intent-coaster.progress.v1')));
    const chest=coasterIds[0],gate=coasterIds[1];
    await relocate([42,2.1,-132.8]);
    const atChest=await stand(chest);
    const initial=await read();
    assert.equal(initial.passed.length,6);
    assert.ok(!initial.chestOpen&&!initial.keyTaken&&!initial.gateOpen);
    await key('keyboard');
    await wait(()=>JSON.parse(localStorage.getItem('bobby-world.intent-coaster.progress.v1')).chestOpen);
    const opened=await read();
    assert.ok(!opened.keyTaken);
    await restored(chest);
    const take=page.locator('.intent-workshop-summary .intent-primary');
    const label=(await take.innerText()).trim();
    assert.match(label,/key/i);
    await take.click();
    await wait(()=>JSON.parse(localStorage.getItem('bobby-world.intent-coaster.progress.v1')).keyTaken);
    const taken=await read();
    assert.ok(!taken.gateOpen);
    record(chest,{position:atChest.fixture,prerequisite:'six tasks restored through the actual save codec'},[
      inputStep('keyboard','打开箱盖并确认钥匙仍在箱中',initial,opened),
      inputStep('panel','取走钥匙，仍需亲自开门',opened,taken,label),
    ]);
    const atGate=await stand(gate);
    await key('gamepad');
    await wait(()=>JSON.parse(localStorage.getItem('bobby-world.intent-coaster.progress.v1')).gateOpen);
    const enabled=await read();
    const after=await actor();
    assert.ok(after.grounded);
    const hud=await page.locator('.intent-workshop-summary > p').first().innerText();
    assert.match(hud,/Gate open.*Board via the boarding steps/);
    record(gate,atGate.fixture,[inputStep('gamepad','将钥匙插入大门，解锁后续登车',taken,{...enabled,hud,grounded:true})]);
  }
  async function journal(id,input){
    const at=await stand(id,{rise:.45});
    const events=[];
    for(let index=0;index<3;index++){
      const command=index%2===0?input:input==='gamepad'?'keyboard':'gamepad';
      const before=(await actor()).camp?.state??null;
      await key(command);
      await wait(({id,index})=>{
        const s=window.__worldCampPropPlay?.();
        return s?.id===id&&s.state?.page===index&&s.state?.turn<0&&window.__worldDebug.state().nearbyInteract?.id===id;
      },{id,index},14000);
      events.push(inputStep(command,index===0?'打开日志':`翻到日志第 ${index+1} 页`,before,(await actor()).camp.state));
    }
    await key('gamepad');
    await wait(()=>window.__worldCampPropPlay?.()?.id===null&&window.__worldCampPropPlay?.()?.lastCancel?.reason==='journal-finished');
    const after=await restored(id);
    events.push(inputStep('gamepad','合上日志，恢复取用提示',{page:2},{id:after.camp.id,reason:after.camp.lastCancel.reason,grounded:after.grounded,choices:after.choices}));
    return {fixture:at.fixture,events};
  }

  const alphaSnapshot=()=>page.evaluate(()=>({state:window.__alphaIsland.state(),motion:window.__alphaIsland.motion()}));
  const alphaKeys=['alpha-card','alpha-bell','alpha-sand','alpha-tree','alpha-wind','alpha-stone','alpha-lantern'];
  async function alphaStation(id,input){
    const at=await stand(id);
    const before=await alphaSnapshot();
    await key(input);
    const kind=id.slice('alpha-'.length);
    await wait(({kind,before})=>{
      const api=window.__alphaIsland,s=api.state(),motion=api.motion(), grounded=window.__worldDebug.snapshot().grounded;
      if(!grounded)return false;
      if(kind==='card')return s.card===true&&s.visits.includes(1);
      if(kind==='stone')return s.stones===before.state.stones+1&&s.action===null;
      if(kind==='wind')return s.wind===(before.state.wind+1)%3&&s.action===null;
      if(kind==='lantern')return s.carried===true&&s.action==='lantern';
      return motion[kind+'At']>before.motion[kind+'At']&&s.action===null;
    },{kind,before},16000);
    const after=await alphaSnapshot();
    const result={fixture:at.fixture,events:[inputStep(input,'操作站点并确认结果',{id,...before},{...after,actor:await actor()})]};
    if(kind==='lantern'){
      const release='alpha-lantern-release',where=await actor();
      await registerRow(release);ids.push(release);
      await wait(release=>window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id===release),release);
      await choose(release);
      await key('gamepad');
      await wait(count=>!window.__alphaIsland.state().carried&&window.__alphaIsland.motion().lanternCount===count+1,after.motion.lanternCount);
      emit({route:'interaction-case',family:'alpha-stations',id:release,ok:true,fixture:null,
        events:[inputStep('gamepad','放飞纸灯并交还输入',{...after,actor:where},{...await alphaSnapshot(),actor:await actor()})]});
    }
    return result;
  }
  async function alphaExhibit(id,input){
    const at=await stand(id),before=await actor(),mural=id.endsWith('mural'),sluice=id.includes('sluice');
    await key(input);
    await wait(({previous,sluice,mural,id})=>{
      const w=window.__worldDebug,s=w.state();
      if(s.toast?.at===previous.toast?.at||!w.snapshot().grounded)return false;
      if(sluice)return s.nearbyInteract?.choices.some(c=>c.id===id&&c.label.en!==previous.label);
      return mural?/Mountains, water and a sun/.test(s.toast?.en??''):/The (clear|low) echo/.test(s.toast?.en??'');
    },{previous:before,sluice,mural,id});
    const after=await actor();
    let promptCycle;
    if(!sluice&&!mural){
      // The shared short ring lock must agree with every displayed chime offer.
      await wait(()=>window.__worldInteract.list().filter(row=>row.id.startsWith('alpha-cave-chime-')).every(row=>!row.enabled),undefined,3000);
      const hidden=await wait(()=>!window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id.startsWith('alpha-cave-chime-')),undefined,3000);
      await hidden.dispose();
      promptCycle={duringCooldown:(await actor()).choices,restored:(await restored(id)).choices};
    }
    return {fixture:at.fixture,events:[inputStep(input,sluice?'改变闸门开度和水流提示':mural?'在侧洞末端阅读壁画':'击管并启动对应回声',
      {id,label:before.label,toast:before.toast},{label:after.label,toast:after.toast,grounded:after.grounded,choices:after.choices,promptCycle})]};
  }
  const transport={
    ferry:{from:[-10,2.02,109],to:[156,2.42,148],returnTo:[-10,2.02,109]},
    cable:{from:[260,38.88,148],to:[260,73.88,218],returnTo:[266,38.88,150]},
  };
  async function reverseRide(id,input){
    const kind=id.split('-')[1], {from,to,returnTo}=transport[kind], forward=`alpha-${kind}-board-0`;
    const start=await stand(forward,{position:from,rise:0,offsets:[[0,0]]});
    const skip=page.getByRole('button',{name:'Skip travel to arrival',exact:true});
    async function board(which,input,destination){
      const before=await actor();
      assert.equal(before.near,which);
      await key(input);
      await skip.waitFor({timeout:38000});
      const riding=await page.evaluate(()=>window.__alphaIsland.ride());
      assert.ok(riding.active);
      await skip.click();
      await wait(([x,,z])=>{
        const a=window.__worldDebug.snapshot();
        return !window.__alphaIsland.ride().active&&a.grounded&&Math.hypot(x-a.player[0],z-a.player[2])<.34;
      },destination,44000);
      return {before,riding:{active:riding.active,phase:riding.phase},landed:await actor()};
    }
    await board(forward,'keyboard',to);
    let returnFixture=null;
    if((await actor()).choices.includes(id))ids.push(id);
    else returnFixture=(await stand(id)).fixture;
    await choose(id);
    const {before,riding,landed}=await board(id,input,returnTo);
    await bot.hold(['KeyW']);
    try{await frames(22);}finally{await bot.release();}
    const after=await actor(), travelled=Math.hypot(after.position[0]-landed.position[0],after.position[2]-landed.position[2]);
    assert.ok(travelled>.15,'body moves again after disembarking');
    return {fixture:{initial:start.fixture,returnStation:returnFixture},events:[
      inputStep(input,'从对岸站台登乘',{id,label:before.label,position:before.position},riding),
      inputStep('panel',kind==='ferry'?'跳过并回到大陆渡口':'跳过并回到缆车下站',riding,{position:landed.position,grounded:landed.grounded},'Skip travel to arrival'),
      inputStep('keyboard','下车后继续移动',{position:landed.position},{position:after.position,grounded:after.grounded,travelled},'W'),
    ]};
  }
  async function callTransport(id,input){
    const at=await stand(id), before=await actor();
    assert.match(before.label,/^Call the /);
    await key(input);
    await wait(id=>{
      const w=window.__worldDebug;
      return !window.__worldInteract.list().find(r=>r.id===id)?.enabled&&!window.__alphaIsland.ride().active
        && /transport is approaching/.test(w.state().toast?.en??'');
    },id,8000);
    const enRoute=await actor();
    await key(input);
    assert.equal((await actor()).toast?.at,enRoute.toast.at,'repeated input cannot launch a second empty journey');
    await wait(id=>{
      const w=window.__worldDebug,s=w.state();
      return !window.__alphaIsland.ride().active&&w.snapshot().grounded
        &&s.nearbyInteract?.choices.some(c=>c.id===id&&c.label.en.startsWith('Board the '));
    },id,165000);
    const docked=await restored(id);
    return {fixture:at.fixture,events:[
      inputStep(input,'呼叫空车或空船，重复输入不重启，等候停靠',
        {id,label:before.label,position:before.position},{enRoute:enRoute.toast,label:docked.label,grounded:docked.grounded,position:docked.position}),
    ]};
  }

  const cases=[
    ['town',census.ids.filter(i=>i.startsWith('town-board-')),card],
    ['park',census.ids.filter(i=>i.startsWith('park-project-')),card],
    ['camp',census.ids.filter(i=>i.startsWith('camp-about-')),card],
    ['journal',['camp-prop-journal'],journal],
    ['seats',census.ids.filter(i=>/^camp-bench-|^street-(bench|shelter-seat)/.test(i)),seat],
    ['alpha-stations',alphaKeys,alphaStation],
    ['alpha-exhibits',census.ids.filter(i=>/^alpha-(waterwheel-sluice-|cave-(chime-|mural))/.test(i)),alphaExhibit],
    ['alpha-return',['alpha-ferry-board-1','alpha-cable-board-1'],reverseRide],
    ['alpha-calls',['alpha-ferry-board-1','alpha-cable-board-1'],callTransport],
    ['club',['djc-club-dance','djc-club-decks','djc-club-project'],club],
    ['club-seats',census.ids.filter(i=>i.startsWith('djc-daybed-')),seat],
    ['factory',census.ids.filter(i=>/^factory-(assembly|batch|compare|finish|frame|release|rework|routing|shell|test|wheels)$/.test(i)),factory],
    ['exchange-project',['alpha-exchange-project'],card],
  ];
  const flows=[['exchange-round',exchangeIds,exchangeRound],['coaster-locks',coasterIds,coasterLocks],['mine-round',mineIds,mineRound]];
  assert.ok(selectors.every(sel=>[...cases,...flows].some(([family,ids])=>sel===family||ids.includes(sel))),'unknown interaction family or ID');
  for(const [family,targets,test] of cases)for(const [i,id] of targets.entries()){
    // Empty repositioning runs in real time for up to 64 seconds, so keep it opt-in.
    if(family==='alpha-calls'&&!selectors.includes(family))continue;
    if(selectors.length&&!selectors.includes(family)&&!selectors.includes(id))continue;
    try{emit({route:'interaction-case',family,id,ok:true,...await test(id,i%2===0?'keyboard':'gamepad')});}
    catch(error){
      failures.push(id);
      emit({route:'interaction-case',family,id,ok:false,error:String(error),actor:await actor().catch(()=>null)});
      const state=await actor().catch(()=>null);
      if(state?.card)await page.locator('.world-card-close').click().catch(()=>{});
      if(state?.seat)await page.keyboard.press('KeyE');
      if(state?.clubMode)await page.keyboard.press('KeyE');
      if(state?.factoryStation)await page.locator('.factory-console').getByRole('button',{name:'Leave console'}).click().catch(()=>{});
    }
  }
  const flowErrors=[];
  for(const [family,targets,test] of flows){
    if(selectors.length&&!selectors.includes(family)&&!targets.some(id=>selectors.includes(id)))continue;
    const completed=new Map();
    try{
      await test((id,fixture,events)=>{
        const row=completed.get(id)??{route:'interaction-case',family,id,ok:true,fixture:[],events:[]};
        row.fixture.push(fixture);
        row.events.push(...events);
        completed.set(id,row);
      });
    }catch(error){
      const failure={family,error:String(error),actor:await actor().catch(()=>null)};
      flowErrors.push(failure);
      emit({route:'flow-error',...failure});
    }
    for(const row of completed.values())emit(row);
    for(const id of targets)if(!completed.has(id)){
      failures.push(id);
      emit({route:'interaction-case',family,id,ok:false,error:'No observed contact in this route'});
    }
  }
  emit({route:'family-summary',entrySha256,ids:[...new Set(ids)],failures,flowErrors,errors,analytics});
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
  assert.deepEqual(flowErrors,[]);
}finally{await browser.close();}
