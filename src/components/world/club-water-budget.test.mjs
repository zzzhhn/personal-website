import {test} from 'node:test';
import assert from 'node:assert/strict';
import {budgetWaterSize,clubWaterBudget,planClubWater,waterHistory,WaterFrameWindow} from './WorldClubWaterBudget.ts';

const input=(extra={})=>({now:0,time:0,high:false,distance:20,visible:true,paused:false,force:false,viewChanged:true,nightChanged:false,night:0,dynamic:false,...extra});
test('independent clocks cap moving captures and cut static/daytime work over a fixed interval',()=>{
  const simulate=(moving,high=false)=>{
    const history=waterHistory(),counts={refraction:0,caustic:0};
    for(let frame=0;frame<600;frame++){
      const t=frame/60,plan=planClubWater(input({now:t,time:t,high,force:frame===0,viewChanged:moving||frame===0}),history);
      for(const pass of Object.keys(counts))if(plan[pass]){counts[pass]++;history[pass]=t;}
      if(plan.caustic)history.causticTime=t;
    }
    return counts;
  };
  assert.deepEqual(simulate(true),{refraction:150,caustic:75});
  assert.deepEqual(simulate(false),{refraction:75,caustic:75});
  assert.deepEqual(simulate(true,true),{refraction:300,caustic:150});
});
test('distant or tiny pools retain the reduced transmission and caustic budgets',()=>{
  for(const high of [false,true]){
    const end=23+(high?44:20);
    assert.deepEqual(clubWaterBudget(high,end),{refractionHz:4,causticHz:4});
    assert.deepEqual(clubWaterBudget(high,20,.001),{refractionHz:4,causticHz:4});
  }
});
test('paused final lighting edits bypass cadence once, hidden samples cannot force a capture',()=>{
  const history={...waterHistory(),refraction:1,caustic:1,causticTime:.017};
  assert.deepEqual(planClubWater(input({now:1.001,time:.017,paused:true,viewChanged:false}),history),{refraction:false,caustic:false});
  assert.deepEqual(planClubWater(input({now:1.001,time:.017,paused:true,viewChanged:false,nightChanged:true,night:1}),history),{refraction:true,caustic:true});
  assert.deepEqual(planClubWater(input({visible:false,force:true}),history),{refraction:false,caustic:false});
  assert.deepEqual(planClubWater(input({distance:75,force:true}),history),{refraction:true,caustic:true});
});
test('target sizes stay bounded across aspect ratios and preserve high quality',()=>{
  for(const high of [false,true])for(const aspect of [.25,.5,1,16/9,4]){
    const [w,h]=budgetWaterSize(aspect,high);assert.equal(w,high?1024:640);assert.ok(h>=128&&h<=1024);
  }
});
test('sampling window retains whole-window slow-frame counts after bounded ring wrap',()=>{
  const window=new WaterFrameWindow();window.record(100);assert.equal(window.stop(),null);window.start();
  for(let i=0;i<2000;i++)window.record(i<100?50:16);
  window.invalidate();const result=window.stop();assert.equal(result.frames,2000);assert.equal(result.percentileSamples,1800);
  assert.equal(result.slow25Ratio,.05);assert.equal(result.slow33Ratio,.05);assert.equal(result.maxMs,50);assert.equal(result.p95Ms,16);assert.equal(result.changedDuringWindow,true);
});

test('slowest intervals retain bounded context and active-window time after percentile wrap',()=>{
  const window=new WaterFrameWindow();window.start();
  const context={phase:'lift',geometries:378};let reads=0;
  const read=()=>{reads++;return context;};
  window.record(254.5,read);
  context.phase='return';context.geometries=501;
  for(let i=0;i<2000;i++)window.record(16,read);
  for(let i=0;i<20;i++)window.record(30+i,read);
  const result=window.stop();
  assert.equal(result.slowestFrames.length,8);assert.equal(result.maxMs,254.5);
  assert.equal(result.p95Ms,16);assert.equal(result.frames,2021);assert.equal(reads,21);
  assert.deepEqual(result.slowestFrames.map(f=>f.ms),[254.5,49,48,47,46,45,44,43]);
  assert.deepEqual(result.slowestFrames[0],{sample:1,activeElapsedMs:254.5,ms:254.5,context:{phase:'lift',geometries:378}});
  assert.equal(result.slowestFrames[1].sample,2021);
  assert.equal(result.slowestFrames[1].activeElapsedMs,254.5+2000*16+790);
  assert.equal(result.slowestFrames[1].context.phase,'return');
});

test('closed, invalid, ordinary, tied and non-retained frames never read context; restart clears evidence',()=>{
  const window=new WaterFrameWindow();let reads=0;
  const read=()=>{reads++;return{phase:'station'};};
  window.record(100,read);assert.equal(reads,0);window.start();
  for(const ms of [NaN,Infinity,-1,0,16,25])window.record(ms,read);
  assert.equal(reads,0);
  for(let i=0;i<8;i++)window.record(40,read);
  for(let i=0;i<10000;i++)window.record(i%2?40:30,read);
  assert.equal(reads,8);
  const result=window.stop();assert.deepEqual(result.slowestFrames.map(f=>f.sample),[3,4,5,6,7,8,9,10]);
  window.record(1000,read);assert.equal(reads,8);assert.equal(window.stop(),null);
  window.start();window.record(17,read);
  const fresh=window.stop();assert.deepEqual(fresh.slowestFrames,[]);assert.equal(fresh.frames,1);
  assert.equal(fresh.changedDuringWindow,false);assert.equal(reads,8);
  // Previously returned evidence survives restart and keeps primitive values.
  assert.equal(result.slowestFrames.length,8);assert.equal(result.slowestFrames[0].context.phase,'station');
});

test('duration-only callers retain slow intervals without requiring a context reader',()=>{
  const window=new WaterFrameWindow();window.start();window.record(53.4);
  assert.deepEqual(window.stop().slowestFrames,[{sample:1,activeElapsedMs:53.4,ms:53.4,context:null}]);
});
