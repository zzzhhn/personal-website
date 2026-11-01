import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMineAction, beginMineAction, cancelMineAction, mineActor, mineVisualSockets, putDownMineOre, resetMineSession, resetMineVeins, useAlphaMineStore } from './alpha-mine-state.ts';

const point=[1,0,0], id='REVERSAL_5';
function fixture(){resetMineSession();Object.assign(mineActor,{position:[0,0,0],yaw:0,grounded:true,moving:false,available:true,restTarget:[.55,.7,0]});Object.assign(mineVisualSockets,{valid:true,assetsReady:true,contactError:0,rightReachError:0,leftReachError:0});}
function advance(seconds){for(let t=0;t<seconds;t+=1/60){const a=useAlphaMineStore.getState().action;mineVisualSockets.sampledActionKind=a?.kind??null;mineVisualSockets.sampledElapsed=a?.elapsed??0;advanceMineAction(1/60);}}
function equipped(){fixture();assert.ok(beginMineAction('equip',point));advance(1);assert.equal(useAlphaMineStore.getState().equipped,true);}
function collected(){equipped();assert.ok(beginMineAction('scan',point,id));advance(1.2);for(let i=0;i<3;i++){assert.ok(beginMineAction('strike',point,id));advance(1.2);}assert.ok(beginMineAction('pickup',point,id));advance(1);}

test('three physical contacts produce one recoverable ore, never one per input/frame',()=>{
  equipped();assert.equal(beginMineAction('strike',point,id),false);
  assert.ok(beginMineAction('scan',point,id));advance(1.2);
  for(let i=0;i<3;i++){
    assert.ok(beginMineAction('strike',point,id));assert.equal(beginMineAction('strike',point,id),false);
    advance(.56);assert.equal(useAlphaMineStore.getState().veins[id].hits,i);
    advance(.6);assert.equal(useAlphaMineStore.getState().veins[id].hits,i+1);
  }
  assert.equal(beginMineAction('strike',point,id),false);
  assert.ok(beginMineAction('pickup',point,id));advance(1);
  assert.equal(useAlphaMineStore.getState().carried,id);assert.equal(beginMineAction('pickup',point,id),false);
});
test('cross-floor, out-of-reach and cancelled wind-ups cannot mine',()=>{
  equipped();assert.equal(beginMineAction('scan',[1,3.1,0],id),false);
  assert.ok(beginMineAction('scan',point,id));advance(1.2);
  assert.equal(beginMineAction('strike',[1.5,0,0],id),false);
  assert.ok(beginMineAction('strike',point,id));advance(.2);cancelMineAction();advance(1);
  assert.equal(useAlphaMineStore.getState().veins[id].hits,0);
  assert.ok(beginMineAction('strike',point,id));mineActor.yaw=Math.PI;advance(1);
  assert.equal(useAlphaMineStore.getState().veins[id].hits,0);
  mineActor.yaw=0;assert.ok(beginMineAction('strike',point,id));mineActor.moving=true;advance(.1);
  assert.equal(useAlphaMineStore.getState().action,null);
});
test('release and arrival are distinct; interruption returns the same ore',()=>{
  collected();assert.ok(beginMineAction('deposit',point,id,0));advance(.6);
  assert.equal(useAlphaMineStore.getState().carried,null);assert.equal(useAlphaMineStore.getState().bays[0],null);
  cancelMineAction();assert.equal(useAlphaMineStore.getState().carried,id);
  assert.ok(beginMineAction('deposit',point,id,0));advance(1.5);
  assert.equal(useAlphaMineStore.getState().bays[0],id);assert.equal(useAlphaMineStore.getState().carried,null);
  assert.ok(beginMineAction('pickup',point,id,0));advance(1);
  assert.equal(useAlphaMineStore.getState().bays[0],id);assert.equal(useAlphaMineStore.getState().carried,id);assert.deepEqual(useAlphaMineStore.getState().recovered,[]);
});
test('put-down preserves identity and refuses reset or overwriting the loose ore',()=>{
  collected();assert.ok(putDownMineOre());assert.equal(useAlphaMineStore.getState().dropped,null);
  advance(1.5);const drop=useAlphaMineStore.getState().dropped;
  assert.equal(drop.factorId,id);assert.equal(resetMineVeins(),false);
  assert.equal(beginMineAction('pickup',point,'ROC20_RANK'),false);
  assert.ok(beginMineAction('pickup',drop.position,id));advance(1);
  assert.equal(useAlphaMineStore.getState().dropped,null);assert.equal(useAlphaMineStore.getState().carried,id);
});
test('new exploration preserves comparison evidence when mining the same factor again',()=>{
  collected();assert.ok(beginMineAction('deposit',point,id,0));advance(1.5);assert.ok(resetMineVeins());
  assert.equal(useAlphaMineStore.getState().bays[0],id);
  assert.ok(beginMineAction('scan',point,id));advance(1.2);
  for(let i=0;i<3;i++){assert.ok(beginMineAction('strike',point,id));advance(1.2);}
  assert.ok(beginMineAction('pickup',point,id));advance(1);
  assert.equal(useAlphaMineStore.getState().carried,id);assert.equal(useAlphaMineStore.getState().bays[0],id);
});

test('three ores can replace either result without losing recovered stones or blocking play',()=>{
  equipped();const ids=['REVERSAL_5','ROC20_RANK','LOW_STD_20'];
  for(let i=0;i<3;i++){
    const ore=ids[i];useAlphaMineStore.setState({carried:ore});
    assert.ok(beginMineAction('deposit',point,ore,i===1?1:0));advance(1.6);
  }
  assert.deepEqual(useAlphaMineStore.getState().bays,[ids[2],ids[1]]);
  assert.deepEqual(useAlphaMineStore.getState().recovered,ids);
  assert.ok(beginMineAction('pickup',point,ids[0]));advance(1);
  assert.ok(putDownMineOre());advance(1.6);
  assert.ok(beginMineAction('pickup',point,ids[1]));advance(1);
  assert.equal(useAlphaMineStore.getState().dropped.factorId,ids[0]);
  assert.ok(beginMineAction('deposit',point,ids[1],0));advance(1.6);
  assert.ok(beginMineAction('pickup',useAlphaMineStore.getState().dropped.position,ids[0]));advance(1);
  assert.equal(useAlphaMineStore.getState().carried,ids[0]);
});
test('mining requires a solved asset contact; distant or stale poses cannot award ore',()=>{
  equipped();assert.ok(beginMineAction('scan',point,id));advance(1.2);
  mineVisualSockets.contactError=.3;assert.ok(beginMineAction('strike',point,id));advance(1.2);
  assert.equal(useAlphaMineStore.getState().veins[id].hits,0);
  mineVisualSockets.contactError=0;mineVisualSockets.assetsReady=false;
  assert.ok(beginMineAction('strike',point,id));advance(1.2);
  assert.equal(useAlphaMineStore.getState().veins[id].hits,0);
});

test('a 30 Hz render waits at the exact contact pose across multiple physics steps',()=>{
  equipped();assert.ok(beginMineAction('scan',point,id));advance(1.2);
  assert.ok(beginMineAction('strike',point,id));
  for(let frame=0;frame<45;frame++){
    const a=useAlphaMineStore.getState().action;
    mineVisualSockets.sampledActionKind=a?.kind??null;mineVisualSockets.sampledElapsed=a?.elapsed??0;
    mineVisualSockets.contactError=a&&Math.abs(a.elapsed-.57)<.0001?0:.5;
    advanceMineAction(1/60);advanceMineAction(1/60);
  }
  assert.equal(useAlphaMineStore.getState().veins[id].hits,1);
});
