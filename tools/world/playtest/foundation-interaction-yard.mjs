/** Verify yard inputs against a fresh visit. QA places the actor, gameplay creates every cargo state. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [origin='http://127.0.0.1:4343',...selectors]=process.argv.slice(2);
const world=new URL('/world/',origin);
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport={width:1056,height:700}, errors=[],analytics=[],failures=[],ids=[];
const emit=value=>console.log(JSON.stringify(value));
const plans=[
  ['coil-front','keyboard','照检前卷外侧，货单出现正面记录',/front recorded/i],
  ['turn-front','gamepad','翻转前卷，提示改为检查背面',/Cradle rotated|Rear exposed/],
  ['crane','keyboard','接管吊架并把前卷吊到侧方检查位',/Front coil moved|The front coil is on the side inspection pad/],
  ['coil-rear','gamepad','在开放的槽位验证后卷标识和外侧',/front recorded/i],
  ['turn-rear','keyboard','翻转后卷，提示改为检查背面',/Cradle rotated|Rear exposed|Coil turned/],
  ['gallery-front','gamepad','从高廊观测仪记录前卷两面',/Gallery (survey|check) complete|Evidence complete/],
  ['gallery-rear','keyboard','从高廊观测仪记录后卷两面',/Gallery (survey|check) complete|Evidence complete/],
  ['scale-a','keyboard','称 A 箱并读取公斤数',/kg/],
  ['scale-b','gamepad','称 B 箱并读取公斤数',/kg/],
  ['load-a','keyboard','启动 A 托运输并确认首托实际进车厢',/pallet is (now )?in the truck/],
  ['load-b','gamepad','启动 B 托运输并确认两托实际进车厢',/pallet is (now )?in the truck/],
  ['truck-a','keyboard','卸回 A 托，货单减少一托',/Cargo returned/],
  ['truck-b','gamepad','卸回 B 托，货单减少一托',/Cargo returned/],
];
const selection=selectors.map(id=>id.replace(/^ibd-/,''));
const stockIds=['stock-a','stock-b'];
assert.ok(selection.every(id=>plans.some(([station])=>id===station)||stockIds.includes(id)||id==='reserve'),'unknown yard station');
const prerequisites={'turn-front':['coil-front'],'coil-rear':['crane'],'turn-rear':['crane','coil-rear'],
  'load-b':['load-a'],'truck-a':['load-a','load-b'],'truck-b':['load-a','load-b']};

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
  const ordinary=await browser.newPage({viewport}), entrySha256=await open(ordinary,world);
  await ordinary.locator('.world-camp-return:enabled').waitFor({timeout:75000});
  await ordinary.keyboard.press('Escape');
  await ordinary.locator('dialog[open]').waitFor();
  await ordinary.close();
  emit({route:'ordinary entry',entrySha256,browser:browser.version()});

  const page=await browser.newPage({viewport}),bot=new Bot(page);
  await page.addInitScript(()=>{
    const buttons=Array.from({length:18},()=>({pressed:false,touched:false,value:0}));
    const pad={id:'Yard standard pad fixture',mapping:'standard',connected:true,index:0,axes:[0,0,0,0],buttons,timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null]});
    window.yardPad=(index,active)=>Object.assign(buttons[index],{pressed:active,touched:active,value:Number(active)});
  });
  assert.equal(await open(page,new URL('?qa=1&start=ibd',world)),entrySha256);
  const wait=async(fn,arg,timeout=16000)=>{
    const h=await page.waitForFunction(fn,arg,{timeout,polling:80});
    try{return await h.jsonValue();}finally{await h.dispose();}
  };
  await wait(()=>window.__worldDebug?.state().ready&&window.__worldDebug.snapshot().grounded,undefined,75000);
  await page.evaluate(()=>window.__worldDebug.set({lang:'en',timeRunning:false,light:'noon'}));
  const hud=page.locator('[data-ibd-hud]'), working=hud.locator('.ibd-working');
  const read=()=>page.evaluate(()=>{
    const d=window.__worldDebug,s=d.state(),a=d.snapshot(),hud=document.querySelector('[data-ibd-hud]');
    return {position:a.player,grounded:a.grounded,step:a.physicsStep,near:s.nearbyInteract?.id,label:s.nearbyInteract?.label.en,
      choices:s.nearbyInteract?.choices.map(row=>row.id)??[],
      title:hud?.querySelector('h2')?.textContent,status:hud?.querySelector('.ibd-feedback')?.textContent,
      round:hud?.querySelector('.ibd-ticket-head b')?.textContent,
      working:hud?.querySelector('.ibd-working')?.textContent,
      details:hud?.querySelector('.ibd-details')?.textContent,
      loaded:hud?.querySelector('.ibd-milestones span:last-child b')?.textContent};
  });
  async function frames(count){
    await wait(step=>window.__worldDebug.snapshot().physicsStep>=step,(await read()).step+count,10000);
  }
  async function press(input,control='KeyE'){
    if(input==='keyboard')return page.keyboard.press(control);
    await frames(4);
    await page.evaluate(()=>window.yardPad(3,true));
    try{await frames(8);}finally{await page.evaluate(()=>window.yardPad(3,false));}
  }
  const inputStep=(input,operation,before,after,control=input==='gamepad'?'Y':'E')=>({input,operation,control,before,after});

  async function choose(id){
    const count=(await read()).choices.length;
    for(let i=0;i<count&&(await read()).near!==id;i++){
      await page.keyboard.press('KeyQ');await frames(3);
    }
    assert.equal((await read()).near,id);
  }
  async function stand(id,preferredPosition){
    const row=await wait(id=>window.__worldInteract?.list().find(row=>row.id===id),id,22000);
    ids.push(id);
    const station=id.slice(4),[x,y,z]=row.position;
    const gallery=station.startsWith('gallery'),load=station.startsWith('load');
    const fixtureY=gallery?6.05:2.1, preferred=gallery?-1.15:load?.3:station==='crane'?-.16:0;
    const offsets=[[0,preferred],[0,0],[0,.55],[-.58,0],[.58,0],[0,-.56],[0,1.08],[1.05,0],[-1.05,0],[-.78,.78],[.78,.78]];
    const positions=offsets.map(([dx,dz])=>[x+dx,fixtureY,z+dz]);
    if(preferredPosition)positions.unshift(preferredPosition);
    for(const position of positions){
      const relocated=await page.evaluate(position=>{
        const d=window.__worldDebug,ok=d.teleportPlayer(position);d.set({position});return ok;
      },position);
      assert.ok(relocated);
      const offered=await wait(({id,p})=>{
        const d=window.__worldDebug,a=d.snapshot();
        return a.grounded&&Math.hypot(a.player[0]-p[0],a.player[2]-p[2])<.38&&Math.abs(a.player[1]-p[1])<.45
          &&d.state().nearbyInteract?.choices.some(row=>row.id===id);
      },{id,p:position},2200).catch(()=>false);
      if(offered){
        await choose(id);
        await frames(5);
        return position;
      }
    }
    throw new Error(`No grounded offer at ${id}, anchor ${JSON.stringify([x,y,z])}`);
  }
  async function operate(id,input,operation,expected,fixture=undefined){
    const station=id.slice(4);
    fixture??=await stand(id);
    const before=await read(), events=[];
    assert.equal(before.near,id);
    await press(input);
    if(station==='crane'){
      const crane=hud.getByRole('region',{name:'Manual crane controls'});
      await crane.waitFor();
      const controls=crane.locator('.ibd-crane-directions button');
      await wait(()=>!document.querySelector('.ibd-crane-directions button')?.disabled);
      events.push(inputStep(input,'握住吊架手柄，方向操作启用',before,{...await read(),stage:0}));
      for(const [stage,key,label] of [[0,'ArrowUp','吊起'],[1,'ArrowLeft','横移'],[2,'ArrowDown','落稳']]){
        const start=await read();
        assert.equal(await controls.nth(stage).getAttribute('aria-current'),'step');
        await page.keyboard.down(key);
        try{
          if(stage<2)await wait(stage=>document.querySelectorAll('.ibd-crane-directions button')[stage+1]?.getAttribute('aria-current')==='step',stage,17000);
          else await crane.getByText(/Cargo landed/).waitFor({timeout:18000});
        }finally{await page.keyboard.up(key);}
        events.push(inputStep('keyboard',label,start,{...await read(),stage:stage+1},key));
      }
      await crane.waitFor({state:'hidden',timeout:16000});
    }else if(station!=='manifest'){
      await working.waitFor({timeout:9500});
    }
    await wait(({needle,flags})=>new RegExp(needle,flags).test(document.querySelector('[data-ibd-hud] .ibd-feedback')?.textContent??''),
      {needle:expected.source,flags:expected.flags},19000);
    const after=await read();
    assert.ok(after.grounded);
    assert.ok(!after.working);
    if(station.startsWith('scale'))assert.match(after.status,/\d+\.\d{2} kg/);
    if(station.startsWith('load'))assert.equal(after.loaded,station.endsWith('-a')?'1/2':'2/2');
    if(station.startsWith('truck'))assert.equal(after.loaded,(Number(before.loaded[0])-1)+'/2');
    if(station.startsWith('gallery'))assert.ok(after.position[1]>5.5);
    events.push(inputStep(input,operation,before,after,station==='crane'?'E, ArrowUp, ArrowLeft, ArrowDown':undefined));
    return {fixture,events};
  }

  async function runReserve(){
    const pack='ibd-parts-b', fixture=[-67.93,2.15,-186.5];
    const bench=hud.getByRole('region',{name:'Pocket inspection bench',exact:true});
    const pockets=bench.getByRole('group',{name:'Choose a pocket'}).getByRole('button');
    const present=bench.getByRole('button',{name:'Present selected pocket',exact:true});
    const close=bench.getByRole('button',{name:'Close and read',exact:true});
    const returnPart=bench.getByRole('button',{name:'Return to pocket',exact:true});
    const measured=bench.locator('.ibd-pack-reading strong');
    async function presentPocket(index){
      const selected=pockets.nth(index);
      if(await selected.getAttribute('aria-pressed')!=='true')await selected.click();
      await present.click();
      if(index===3){
        await bench.waitFor({state:'hidden',timeout:21000});
        return 'empty';
      }
      await close.click({timeout:18000});
      await measured.waitFor({timeout:17000});
      const reading=(await measured.innerText()).trim();
      await returnPart.click({timeout:19000});
      await wait(index=>document.querySelectorAll('.ibd-pack-slots button')[index]?.textContent?.startsWith('✓'),index,16000);
      return reading;
    }
    await stand('ibd-manifest');
    await hud.getByRole('button',{name:'Receive the next fictional batch',exact:true}).click();
    await hud.locator('.ibd-ticket-head b').filter({hasText:'02'}).waitFor();
    assert.equal((await read()).loaded,'0/2');
    const opened=await operate(pack,'keyboard','打开本批 B 箱',/Lid open|Carton opened/,await stand(pack,fixture));
    await stand(pack,fixture);
    assert.match((await read()).label,/Count, gauge/);
    await press('keyboard');
    await bench.waitFor();
    const slots=[];
    for(let i=0;i<4;i++)slots.push(await presentPocket(i));
    assert.deepEqual(slots,['M8','M8','M8','empty']);

    await wait(id=>window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id===id),pack);
    await choose(pack);
    const verdict=hud.locator('.ibd-verdict');
    const comparisons=await verdict.locator('.ibd-verdict-evidence p').allTextContents();
    assert.ok(comparisons.some(line=>line.includes('Counted: 3')));
    await verdict.getByRole('button',{name:'Short count',exact:true}).click();
    await wait(()=>/exchange controls are unlocked/i.test(document.querySelector('.ibd-feedback')?.textContent??''));
    await stand(pack,fixture);
    const quarantine=await operate(pack,'keyboard','将短少的原 B 箱送到隔离位',/Original quarantined/,fixture);
    assert.match(quarantine.events.at(-1).after.details,/Bench B empty/);
    emit({route:'yard-reserve-prerequisite',round:'02',slots,comparisons,opened,quarantine});

    for(const [index,station] of stockIds.entries()){
      if(!selection.includes('reserve')&&!selection.includes(station))continue;
      const id='ibd-'+station, input=index===0?'keyboard':'gamepad';
      try{
        const result=await operate(id,input,'打开此后库候选箱并露出实体槽位',/Lid open|Carton opened/);
        const sampleAt=await stand(id);
        const before=await read();
        assert.match(before.label,/Count, gauge/);
        await press(input);
        await bench.waitFor();
        const reading=await presentPocket(0);
        assert.match(reading,/^M[68]$/);
        await bench.getByRole('button',{name:'Put back and choose a carton',exact:true}).click();
        await bench.waitFor({state:'hidden',timeout:18000});
        const after=await read();
        assert.ok(after.grounded);
        assert.match(after.details,/Bench B empty/);
        result.events.push(inputStep(input,'进入此箱逐槽验样',{...before,sampleAt},{reading,pocket:1}));
        result.events.push(inputStep('panel','实体卡规呈样、合拢、归位并退出',{reading},{...after,reading},'Present selected pocket, Close and read, Return to pocket, Put back and choose a carton'));
        emit({route:'interaction-case',family:'yard-reserve',id,ok:true,...result});
      }catch(error){
        failures.push(id);
        emit({route:'interaction-case',family:'yard-reserve',id,ok:false,error:String(error),actor:await read().catch(()=>null)});
        if(await bench.count())await bench.getByRole('button',{name:'Put back and choose a carton',exact:true}).click().catch(()=>{});
      }
    }
  }

  // Use the public E at the original entrance and kit. Later positions are explicitly placed for each test.
  async function entry(id,points,expected){
    const legs=[];
    for(const [x,z] of points){
      const before=await read(), started=performance.now();
      let after=before;
      try{
        while(Math.hypot(x-after.position[0],z-after.position[2])>.38){
          assert.ok(performance.now()-started<16000,JSON.stringify({id,target:[x,z],before,after}));
          const yaw=await page.evaluate(()=>window.__worldDebug.camera().yaw);
          const dx=x-after.position[0],dz=z-after.position[2];
          const right=dx*Math.sin(yaw)-dz*Math.cos(yaw),forward=-dx*Math.cos(yaw)-dz*Math.sin(yaw);
          await bot.hold(comboFor(.8*right-.6*forward,-.6*right-.8*forward).keys);
          await frames(5);
          after=await read();
        }
      }finally{await bot.release();}
      legs.push({target:[x,z],before:before.position,after:after.position,grounded:after.grounded});
    }
    await wait(id=>window.__worldDebug.state().nearbyInteract?.choices.some(row=>row.id===id),id);
    await choose(id);
    const result=await operate(id,'keyboard',id==='ibd-kit'?'装备检验工具':'从公开入口接货单',expected,{walked:legs,start:'ibd entrance'});
    emit({route:'yard-prerequisite',id,...result});
  }
  await entry('ibd-manifest',[[-88,-146],[-90.9,-148.9],[-91,-149.75]],/This batch: inspect|Stock: 2/);
  await entry('ibd-kit',[[-92.65,-150.2],[-93,-151.7],[-94,-155],[-94,-156.75]],/Tools collected|Torch, reader and gauge ready/);
  await hud.getByRole('button',{name:'Hide guidance',exact:true}).click();
  await hud.getByRole('button',{name:/Manifest, observed evidence and exchanges/}).click();
  assert.equal((await read()).loaded,'0/2');
  for(const [station,input,operation,expected] of plans){
    const id='ibd-'+station, family='yard';
    const selected=selection.includes(station)||(!selection.length&&!station.startsWith('truck'));
    // Front scanning and crane movement chronologically unlock the rear route; execute them for targeted repros.
    const prerequisite=selection.some(target=>prerequisites[target]?.includes(station));
    if(!selected&&!prerequisite)continue;
    try{
      const result=await operate(id,input,operation,expected);
      if(selected)emit({route:'interaction-case',family,id,ok:true,...result});
    }catch(error){
      if(selected){
        failures.push(id);
        emit({route:'interaction-case',family,id,ok:false,error:String(error),actor:await read().catch(()=>null)});
      }else emit({route:'yard-prerequisite-error',id,error:String(error),actor:await read().catch(()=>null)});
      if(await working.count()){
        const cancel=hud.getByRole('button',{name:'Cancel this operation',exact:true});
        if(await cancel.count())await cancel.click();
        else await working.waitFor({state:'hidden',timeout:16000}).catch(()=>{});
      }
    }
  }
  if(selection.some(station=>station==='reserve'||stockIds.includes(station))){
    try{await runReserve();}
    catch(error){
      for(const station of stockIds.filter(station=>selection.includes('reserve')||selection.includes(station))){
        const id='ibd-'+station;
        if(failures.includes(id))continue;
        failures.push(id);
        emit({route:'interaction-case',family:'yard-reserve',id,ok:false,error:String(error),actor:await read().catch(()=>null)});
      }
    }
  }
  emit({route:'family-summary',entrySha256,ids:[...new Set(ids)],failures,errors,analytics});
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
}finally{await browser.close();}
