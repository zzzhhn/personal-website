import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { advanceIbdInspectionAction,beginIbdInspectionAction,cancelIbdInspectionAction,ibdInspectionActor,
  ibdInspectionBody,ibdInspectionVisualSockets } from './ibd-inspection-motion.ts';
const anchor={stand:[0,0,0],yaw:0,leftTarget:[.38,1,-.12],rightTarget:[.38,1,.16]};
function fixture(carried=null){
  cancelIbdInspectionAction();ibdInspectionBody.carried=carried;
  Object.assign(ibdInspectionActor,{position:[0,PLAYER_CENTER_HEIGHT,0],yaw:0,grounded:true,available:true,mode:'guide'});
}
function sample(bad={}){
  const a=ibdInspectionBody.action;if(!a)return;
  Object.assign(ibdInspectionVisualSockets,{valid:true,reachable:true,sampledId:a.id,sampledElapsed:a.elapsed,
    leftHand:[...a.anchor.leftTarget],rightHand:[...a.anchor.rightTarget],leftContactError:0,rightContactError:0,contactError:0},bad);
}
function tick(count=1,sampling=true){for(let i=0;i<count;i++){if(sampling)sample();advanceIbdInspectionAction(1/60);}}
test('reserves only valid grounded reaches and legal held state without moving or changing ownership',()=>{
  fixture();const position=[...ibdInspectionActor.position];
  assert.equal(beginIbdInspectionAction('measure',anchor,()=>{}),false);
  assert.equal(beginIbdInspectionAction('return',anchor,()=>{}),false);
  for(const bad of[{leftTarget:[NaN,1,0]},{rightTarget:[1,Infinity,0]},{stand:[1.11,0,0]},{stand:[0,.26,0]},{yaw:NaN}])
    assert.equal(beginIbdInspectionAction('pickup',{...anchor,...bad},()=>{}),false);
  ibdInspectionActor.grounded=false;assert.equal(beginIbdInspectionAction('pickup',anchor,()=>{}),false);ibdInspectionActor.grounded=true;
  assert.ok(beginIbdInspectionAction('pickup',anchor,()=>{}));assert.equal(beginIbdInspectionAction('empty',anchor,()=>{}),false);
  tick(300);assert.deepEqual(ibdInspectionActor.position,position);assert.equal(ibdInspectionActor.yaw,0);assert.equal(ibdInspectionBody.carried,null);
  fixture({spec:'M8'});assert.equal(beginIbdInspectionAction('pickup',anchor,()=>{}),false);assert.equal(beginIbdInspectionAction('empty',anchor,()=>{}),false);
});
test('all four actions commit once through the two-hand gate and the caller owns carrying',()=>{
  for(const kind of['pickup','measure','return','empty']){
    const carried=kind==='measure'||kind==='return'?{spec:'M6'}:null;fixture(carried);let contacts=0;
    assert.ok(beginIbdInspectionAction(kind,anchor,()=>{contacts++;}));tick(300);
    assert.equal(contacts,1,kind);assert.equal(ibdInspectionBody.action,null);assert.equal(ibdInspectionBody.carried,carried);
  }
});
test('return and empty remain busy after confirmed contact until the tray recovery clock completes',()=>{
  for(const kind of['return','empty']){
    fixture(kind==='return'?{spec:'M8'}:null);let contacts=0;assert.ok(beginIbdInspectionAction(kind,anchor,()=>contacts++));
    while(contacts===0&&ibdInspectionBody.action)tick();
    const a=ibdInspectionBody.action;assert.ok(a?.committed);assert.equal(a.elapsed,a.contactAt);
    const untilClear=Math.ceil(a.recoverDuration*60);tick(untilClear);assert.equal(ibdInspectionBody.action,a);
    assert.ok(a.duration-a.elapsed>1.4);tick(250);assert.equal(ibdInspectionBody.action,null);assert.equal(contacts,1);
  }
});
test('approach requires real position and yaw; timeout cancels',()=>{
  fixture();let cancel=0;ibdInspectionActor.position[0]=.6;
  assert.ok(beginIbdInspectionAction('empty',anchor,()=>assert.fail('unreachable contact'),()=>cancel++));tick(40);
  assert.equal(ibdInspectionBody.action.phase,'approach');ibdInspectionActor.position[0]=0;ibdInspectionActor.yaw=.4;tick(40);
  assert.equal(ibdInspectionBody.action.phase,'approach');tick(50);assert.equal(ibdInspectionBody.action,null);assert.equal(cancel,1);
});
test('stale id/time, invalid palms, either miss, unreachable reach and fabricated error reject contact',()=>{
  const cases=[{sampledId:-1},{sampledElapsed:0},{valid:false},{reachable:false},
    {leftContactError:.026},{rightContactError:.026},{leftContactError:NaN},{rightContactError:-1},
    {leftHand:[100,1,0]},{rightHand:[100,1,0]},{leftHand:[NaN,1,0]}];
  for(const bad of cases){fixture({spec:'M8'});let contacts=0,cancels=0;
    assert.ok(beginIbdInspectionAction('measure',anchor,()=>contacts++,()=>cancels++));tick();
    for(let i=0;i<150&&ibdInspectionBody.action;i++){sample(bad);advanceIbdInspectionAction(1/60);}
    assert.equal(contacts,0,JSON.stringify(bad));assert.equal(cancels,1);assert.equal(ibdInspectionBody.action,null);
  }
});
test('clock holds for an exact render sample and pause cannot advance or commit',()=>{
  fixture();let contacts=0;assert.ok(beginIbdInspectionAction('empty',anchor,()=>contacts++));tick();tick(130,false);
  const a=ibdInspectionBody.action;assert.equal(a.elapsed,a.contactAt);sample();const before=structuredClone(a);
  for(let i=0;i<60;i++)advanceIbdInspectionAction(1/60,true);
  assert.deepEqual(a,before);assert.equal(contacts,0);advanceIbdInspectionAction(1/60);assert.equal(contacts,1);tick(200);
});
test('cancel, lost footing, changed mode/stand, unavailable actor and lost reach have no late callback',()=>{
  for(const interrupt of[()=>cancelIbdInspectionAction(),()=>{ibdInspectionActor.grounded=false;},
    ()=>{ibdInspectionActor.mode='vehicle';},()=>{ibdInspectionActor.available=false;},()=>{ibdInspectionActor.position[0]=.2;},
    ()=>{sample({reachable:false});}]){
    fixture({spec:'M6'});let contacts=0,cancels=0;assert.ok(beginIbdInspectionAction('return',anchor,()=>contacts++,()=>cancels++));tick();tick(10);
    const old=ibdInspectionBody.action;interrupt();advanceIbdInspectionAction(1/60);tick(130,false);
    Object.assign(ibdInspectionVisualSockets,{valid:true,reachable:true,sampledId:old.id,sampledElapsed:old.contactAt,leftContactError:0,rightContactError:0,
      leftHand:[...anchor.leftTarget],rightHand:[...anchor.rightTarget]});tick(5,false);
    assert.equal(contacts,0);assert.equal(cancels,1);assert.equal(ibdInspectionBody.action,null);
  }
});
test('jaw-gap rejection stays rejected; throws are visible and never retried; callbacks may cancel safely',()=>{
  fixture({spec:'M6'});let cancels=0;
  assert.ok(beginIbdInspectionAction('measure',anchor,()=>false,()=>cancels++));tick(130);assert.equal(cancels,1);
  let calls=0;assert.ok(beginIbdInspectionAction('measure',anchor,()=>{calls++;throw new Error('geometry rejection');}));
  assert.throws(()=>tick(130),/geometry rejection/);tick(130);assert.equal(calls,1);
  assert.ok(beginIbdInspectionAction('return',anchor,()=>{cancelIbdInspectionAction();}));tick(130);assert.equal(ibdInspectionBody.action,null);
});
test('invalid dt is inert, anchors copy, action ids cannot reuse a cancelled sample',()=>{
  fixture();const copy=structuredClone(anchor);assert.ok(beginIbdInspectionAction('pickup',copy,()=>{}));
  const a=ibdInspectionBody.action;copy.leftTarget[0]=999;assert.equal(a.anchor.leftTarget[0],.38);
  for(const dt of[0,-1,NaN,Infinity])advanceIbdInspectionAction(dt);assert.equal(a.elapsed,0);
  cancelIbdInspectionAction();assert.ok(beginIbdInspectionAction('pickup',anchor,()=>{}));assert.ok(ibdInspectionBody.action.id>a.id);cancelIbdInspectionAction();
});
