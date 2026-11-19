/** Audit real input and results, using QA only to locate each production interaction on real ground. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import census from '../../../docs/world/foundation-20261117/interaction-census.json' with {type:'json'};
import { Bot, CHROME, loadPlaywright } from './lib.mjs';

const [origin='http://127.0.0.1:4343',...selectors]=process.argv.slice(2);
const world=new URL('/world/',origin), errors=[], analytics=[], failures=[], ids=[];
const browser=await loadPlaywright().chromium.launch({executablePath:CHROME,headless:true,args:['--use-angle=metal']});
const viewport={width:1056,height:700};
const emit=value=>console.log(JSON.stringify(value));
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
  await page.addInitScript(()=>{
    const buttons=Array.from({length:18},()=>({pressed:false,touched:false,value:0}));
    const pad={id:'Foundation families standard pad',mapping:'standard',connected:true,index:0,axes:[0,0,0,0],buttons,timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null]});
    window.familyPad=(i,pressed)=>Object.assign(buttons[i],{pressed,touched:pressed,value:Number(pressed)});
  });
  assert.equal(await open(page,new URL('?qa=1',world)),entrySha256);
  const wait=(fn,arg,timeout=18000)=>page.waitForFunction(fn,arg,{timeout,polling:80});
  await wait(()=>window.__worldDebug?.state().ready&&window.__worldDebug.snapshot().player,undefined,75000);
  await page.evaluate(()=>window.__worldDebug.set({lang:'en',timeRunning:false,light:'noon'}));
  function actor(){return page.evaluate(()=>{
    const d=window.__worldDebug,s=d.state(),a=d.snapshot();
    return {position:a.player,grounded:a.grounded,step:a.physicsStep,near:s.nearbyInteract?.id,choices:s.nearbyInteract?.choices.map(c=>c.id)??[],
      label:s.nearbyInteract?.label.en,card:s.card,seat:s.seat?.id??null,toast:s.toast,camp:window.__worldCampPropPlay?.()};
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
    for(let i=0;i<4&&(await actor()).near!==id;i++){await page.keyboard.press('KeyQ');await frames(3);}
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
    const at=await stand(id);
    await key(input);
    await wait(id=>window.__worldDebug.state().seat?.id===id,id,10000);
    await frames(5);
    const seated=await actor();
    const exit=input==='keyboard'?'gamepad':'keyboard';
    await key(exit);
    await wait(()=>!window.__worldDebug.state().seat&&window.__worldDebug.snapshot().grounded,undefined,10000);
    const after=await actor();
    assert.ok(Math.abs(after.position[1]-at.actor.position[1])<.95,'standing stayed on the same floor');
    assert.ok(Math.hypot(after.position[0]-at.actor.position[0],after.position[2]-at.actor.position[2])<2.5,'standing stayed by this bench');
    return {fixture:at.fixture,events:[
      inputStep(input,'坐到指定座位',{near:at.actor.near,position:at.actor.position},{seat:seated.seat,position:seated.position}),
      inputStep(exit,'起身并在座位旁落地',{seat:seated.seat},{seat:after.seat,position:after.position,grounded:after.grounded}),
    ]};
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
  ];
  assert.ok(selectors.every(sel=>cases.some(([family,ids])=>sel===family||ids.includes(sel))),'unknown interaction family or ID');
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
    }
  }
  emit({route:'family-summary',entrySha256,ids:[...new Set(ids)],failures,errors,analytics});
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
}finally{await browser.close();}
