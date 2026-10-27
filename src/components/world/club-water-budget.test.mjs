import {test} from 'node:test';
import assert from 'node:assert/strict';
import {budgetWaterSize,clubWaterBudget,planClubWater,waterHistory,WaterFrameWindow} from './WorldClubWaterBudget.ts';

const input=(extra={})=>({now:0,time:0,high:false,distance:20,visible:true,paused:false,force:false,viewChanged:true,nightChanged:false,night:0,dynamic:false,...extra});
test('independent clocks cap moving captures and cut static/daytime work over a fixed interval',()=>{
  const simulate=(moving,high=false)=>{
    const history=waterHistory(),counts={refraction:0,reflection:0,caustic:0};
    for(let frame=0;frame<600;frame++){
      const t=frame/60,plan=planClubWater(input({now:t,time:t,high,force:frame===0,viewChanged:moving||frame===0}),history);
      for(const pass of Object.keys(counts))if(plan[pass]){counts[pass]++;history[pass]=t;}
      if(plan.reflection)history.reflectionTime=t;if(plan.caustic)history.causticTime=t;
    }
    return counts;
  };
  assert.deepEqual(simulate(true),{refraction:150,reflection:60,caustic:75});
  assert.deepEqual(simulate(false),{refraction:75,reflection:60,caustic:75});
  assert.deepEqual(simulate(true,true),{refraction:300,reflection:150,caustic:150});
});
test('reflection fades continuously at both distance and projected-area cutoffs',()=>{
  for(const high of [false,true]){
    const end=23+(high?44:20);
    assert.ok(clubWaterBudget(high,end-.001).reflectionWeight<1e-6);
    assert.equal(clubWaterBudget(high,end).reflectionWeight,0);
    assert.ok(Math.abs(clubWaterBudget(high,20,.020001).reflectionWeight-clubWaterBudget(high,20,.019999).reflectionWeight)<1e-6);
    assert.equal(clubWaterBudget(high,20,.001).reflectionWeight,0);
  }
});
test('paused final lighting edits bypass cadence once, hidden samples cannot force a capture',()=>{
  const history={...waterHistory(),refraction:1,reflection:1,caustic:1,reflectionTime:.017,causticTime:.017};
  assert.deepEqual(planClubWater(input({now:1.001,time:.017,paused:true,viewChanged:false}),history),{refraction:false,reflection:false,caustic:false});
  assert.deepEqual(planClubWater(input({now:1.001,time:.017,paused:true,viewChanged:false,nightChanged:true,night:1}),history),{refraction:true,reflection:true,caustic:true});
  assert.deepEqual(planClubWater(input({visible:false,force:true}),history),{refraction:false,reflection:false,caustic:false});
  assert.deepEqual(planClubWater(input({distance:75,force:true}),history),{refraction:true,reflection:false,caustic:true});
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
