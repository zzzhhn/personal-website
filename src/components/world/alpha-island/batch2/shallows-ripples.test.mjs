import test from 'node:test';
import assert from 'node:assert/strict';
import { createShallowsRipples,clearShallowsRipples,armShallowsRipple,takeShallowsRipple,stepShallowsRipples,withShallowsRippleShader,SHALLOWS_RIPPLE_SLOTS } from './shallows-ripples.ts';
import { createShallowsState,pushShallowsStone,stepShallowsStone,shallowsStonePosition,resetShallows } from './shallows-state.ts';
import { createShallowsArrivalReceipts,takeShallowsArrival } from './batch2-station-feedback.ts';

const safe=[-43.6,12.82,-58.45];
const movingStone=(state,ripples,index)=>{
  assert.equal(pushShallowsStone(state,index,safe),true);
  for(let k=0;k<40;k++)if(stepShallowsStone(state,.05,safe))armShallowsRipple(ripples,index);
};
const confirm=(receipts,state,ripples,index,error)=>{
  const receipt=takeShallowsArrival(receipts,state,index,error);
  const p=shallowsStonePosition(index,1);
  return !!receipt&&takeShallowsRipple(ripples,index,p[0],p[2]);
};

test('only one real final-pose receipt per stone causes a local water disturbance',()=>{
  const state=createShallowsState(),receipts=createShallowsArrivalReceipts(),ripples=createShallowsRipples();
  assert.equal(confirm(receipts,state,ripples,0,0),false,'no physical motion');
  movingStone(state,ripples,0);
  assert.equal(confirm(receipts,state,ripples,0,.04),false,'logical progress precedes physical arrival');
  assert.equal(ripples.values[3],0);
  assert.equal(confirm(receipts,state,ripples,0,.004),true);
  const p=shallowsStonePosition(0,1);
  assert.ok(Math.abs(ripples.values[0]-p[0])<1e-5);
  assert.ok(Math.abs(ripples.values[1]-p[2])<1e-5);
  stepShallowsRipples(ripples,.05,true);
  const age=ripples.values[2];
  assert.equal(confirm(receipts,state,ripples,0,0),false);
  assert.equal(ripples.values[2],age,'repeated confirmation cannot restart the wave');
});

test('pause or leave clears active and pending effects without replay; resumed fresh motion can finish',()=>{
  for(const boundary of ['pause','leave']){
    const state=createShallowsState(),receipts=createShallowsArrivalReceipts(),ripples=createShallowsRipples();
    movingStone(state,ripples,0);
    stepShallowsRipples(ripples,20,false);
    assert.equal(confirm(receipts,state,ripples,0,0),false,`${boundary} must discard pending old arrivals`);
    assert.ok(ripples.values.every(v=>v===0));
    assert.equal(ripples.active.value,0);
    movingStone(state,ripples,1);
    assert.equal(confirm(receipts,state,ripples,1,0),true,'fresh post-boundary motion still works');
    stepShallowsRipples(ripples,.05,false);
    assert.ok(ripples.values.every(v=>v===0),'active waves also clear immediately');
    stepShallowsRipples(ripples,.05,true);
    assert.ok(ripples.values.every(v=>v===0),'resume never restores an old disturbance');
  }
});

test('eight fixed slots expire with bounded game time and reset safely enables a fresh round',()=>{
  const state=createShallowsState(),receipts=createShallowsArrivalReceipts(),ripples=createShallowsRipples(),buffer=ripples.values;
  for(let round=0;round<2;round++){
    for(let i=0;i<SHALLOWS_RIPPLE_SLOTS;i++){
      movingStone(state,ripples,i);assert.equal(confirm(receipts,state,ripples,i,0),true);
    }
    assert.equal(ripples.values,buffer);
    assert.equal(buffer.length,32);
    assert.equal([...buffer].filter((_,i)=>i%4===3).reduce((a,b)=>a+b),8);
    stepShallowsRipples(ripples,999,true);
    assert.ok(buffer[2]<.051,'long frames cannot fast-forward the water');
    for(let k=0;k<30;k++)stepShallowsRipples(ripples,.05,true);
    assert.equal([...buffer].filter((_,i)=>i%4===3).reduce((a,b)=>a+b),0);
    assert.equal(ripples.active.value,0,'inactive shader bypasses the fixed loop and normal perturbation');
    assert.equal(resetShallows(state,safe),true);clearShallowsRipples(ripples);
    assert.ok(buffer.every(v=>v===0));
  }
  for(const i of [-1,8,1.5,NaN]){
    armShallowsRipple(ripples,i);assert.equal(takeShallowsRipple(ripples,i,0,0),false);
  }
  assert.equal(ripples.pending,0);
});

test('current Three standard fragment injection keeps height declaration before normal use',async()=>{
  const { ShaderLib }=await import('three');
  const fragment=withShallowsRippleShader(ShaderLib.standard.fragmentShader);
  assert.match(fragment,/uniform vec4 uShallowsRipples\[8\]/);
  assert.match(fragment,/uniform float uShallowsRippleActive/);
  assert.ok(fragment.indexOf('float alphaImpactHeight=')<fragment.indexOf('dFdx(alphaImpactHeight)'));
  assert.ok(fragment.includes('if (uShallowsRippleActive < .5) return 0.;'));
  assert.ok(fragment.includes('if (uShallowsRippleActive > .5)'));
  assert.ok(fragment.includes('varying vec3 vViewPosition;'));
  assert.throws(()=>withShallowsRippleShader('void main() {}'),/boundaries changed/);
  // This checks the real shader source layout; it is deliberately not a WebGL compilation claim.
});

test('arrival centers and the existing water vertices use the same island-local coordinates',async()=>{
  const { createShallowsWater }=await import('./shallows-art.ts');
  const geometry=createShallowsWater();
  try{
    geometry.computeBoundingBox();const bounds=geometry.boundingBox;
    for(let i=0;i<SHALLOWS_RIPPLE_SLOTS;i++){
      const p=shallowsStonePosition(i,1);
      assert.ok(p[0]>bounds.min.x&&p[0]<bounds.max.x&&p[2]>bounds.min.z&&p[2]<bounds.max.z);
    }
    assert.ok(bounds.max.x<0&&bounds.max.z<0,'water coordinates are local, not translated by ALPHA_ORIGIN');
  }finally{geometry.dispose();}
});
