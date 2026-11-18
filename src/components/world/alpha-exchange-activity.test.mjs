import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities, activityApproachMotion } from './actor-activities.ts';
import { registerExchangeActivity } from './alpha-exchange-activity.ts';
import { registerMineActivity } from './alpha-mine-activity.ts';
import { exchangePlayAnchor, cancelExchangePlay, canRequestExchangePlay, requestExchangePlay, useExchangePlay } from './alpha-exchange-play.ts';
import { beginExchangeBodyAction, exchangeActor, exchangeBody, exchangeVisualSockets } from './alpha-exchange-motion.ts';
import { resetMineSession, mineActor, useAlphaMineStore } from './alpha-mine-state.ts';
import { useWorldStore } from './store.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { ALPHA_EXCHANGE_FOOTPRINT } from './alpha-exchange-layout.ts';

function fixture(){
  cancelExchangePlay('test');resetMineSession();
  const registry=createActorActivities(),release=registerExchangeActivity(registry),anchor=exchangePlayAnchor('archive');
  const position=[anchor.stand[0],anchor.stand[1]+PLAYER_CENTER_HEIGHT,anchor.stand[2]];
  const sync=patch=>registry.sync({position,groundRoute:(_from,to)=>[to[0],to[1]+PLAYER_CENTER_HEIGHT,to[2]],yaw:anchor.yaw,grounded:true,available:true,...patch});
  sync();
  return {registry,release,anchor,position,sync};
}

test('registered exchange walks and turns through generic stance data then commits without rendered hands',()=>{
  const f=fixture();let contacts=0;
  try{
    let position=[f.position[0]+.6,f.position[1],f.position[2]],yaw=f.anchor.yaw;
    f.sync({position});assert.ok(beginExchangeBodyAction('pickup',f.anchor,()=>{contacts++;}));
    for(let i=0;i<210;i++){
      f.sync({position,yaw});assert.equal(exchangeActor.available,true,'an action must not block its own owner');
      const stance=f.registry.approach(),motion=stance&&activityApproachMotion(position,stance);
      if(motion){position=[position[0]+motion.vx/60,position[1],position[2]+motion.vz/60];yaw=motion.yaw;}
      f.sync({position,yaw});f.registry.advance(1/60);
    }
    assert.equal(contacts,1);assert.equal(exchangeBody.carried,'ticket');assert.equal(exchangeBody.action,null);
    assert.equal(exchangeVisualSockets.valid,false);assert.equal(f.registry.carrying(),true);
  }finally{f.release();}
});

test('mine and exchange ownership cannot authorize each other while carrying an item',()=>{
  const f=fixture(),releaseMine=registerMineActivity(f.registry);
  try{
    useAlphaMineStore.setState({carried:'REVERSAL_5'});f.sync();
    assert.equal(mineActor.available,true);assert.equal(exchangeActor.available,false);
    assert.equal(beginExchangeBodyAction('pickup',f.anchor,()=>{}),false);
    useAlphaMineStore.setState({carried:null});exchangeBody.carried='ticket';f.sync();
    assert.equal(exchangeActor.available,true);assert.equal(mineActor.available,false);
  }finally{releaseMine();f.release();resetMineSession();}
});

test('blocked approach cancels once, recovery clears the carried ticket and leaving the hall clears the session',()=>{
  const f=fixture();let contacts=0,cancels=0;
  try{
    assert.ok(beginExchangeBodyAction('pickup',f.anchor,()=>{contacts++;},()=>{cancels++;}));
    f.registry.interrupt('blocked');for(let i=0;i<90;i++)f.registry.advance(1/60);
    assert.equal(contacts,0);assert.equal(cancels,1);
    exchangeBody.carried='ticket';f.registry.interrupt('motion');assert.equal(exchangeBody.carried,'ticket');
    f.registry.interrupt('recovery');assert.equal(exchangeBody.carried,null);
    exchangeBody.carried='receipt';f.sync({position:[ALPHA_EXCHANGE_FOOTPRINT.maxX+9,f.position[1],f.position[2]]});
    assert.equal(exchangeBody.carried,null);
  }finally{f.release();}
});

test('unmount invalidates the pending callback, carried silhouette and visual samples',()=>{
  const f=fixture();let contacts=0;
  assert.ok(beginExchangeBodyAction('pickup',f.anchor,()=>{contacts++;}));
  exchangeVisualSockets.valid=true;f.release();f.registry.advance(1);
  assert.equal(contacts,0);assert.equal(exchangeBody.action,null);assert.equal(exchangeBody.carried,null);
  assert.equal(exchangeActor.available,false);assert.equal(exchangeVisualSockets.valid,false);
});


test('ring activation checks the current passage even when the previous bell offer is stale', () => {
  const f = fixture();
  try {
    const bell = exchangePlayAnchor('bell');
    const end = [bell.stand[0], bell.stand[1] + PLAYER_CENTER_HEIGHT, bell.stand[2]];
    useWorldStore.setState({ paused: false });
    useExchangePlay.setState({ round: { phase: 'sealed' } });
    for (const passable of [false, true]) {
      f.sync({ position: [end[0], end[1], end[2] + .6],
        groundRoute: (_from, _to, _limit, fresh) => (fresh ? passable : !passable) ? end : null });
      assert.equal(canRequestExchangePlay('bell'), !passable);
      assert.equal(requestExchangePlay('bell'), passable);
    }
  } finally { f.release(); }
});
