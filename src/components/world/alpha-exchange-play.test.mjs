import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangePlayController, requestExchangePlay, useExchangePlay, releaseExchangePlay, exchangePlayAnchor } from './alpha-exchange-play.ts';
import { advanceExchangeBodyAction, exchangeActor, exchangeBody, exchangeVisualSockets } from './alpha-exchange-motion.ts';
import { useAlphaExchange } from './alpha-exchange-state.ts';
import { useWorldStore } from './store.ts';
import { PLAYER_CENTER_HEIGHT } from './actor-physics.ts';

const days = () => Array.from({length:12},(_,i) => ({date:`2026-01-${String(i+1).padStart(2,'0')}`,value:100+i}));
const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(initialPhase='open') {
  let source={phase:initialPhase,history:initialPhase==='open'?days():[],error:null}, action=null, carried=null, near=true;
  let load=async()=>{source={phase:'open',history:days(),error:null};}, loads=0, releases=0;
  const play=createExchangePlayController({history:()=>source,load:()=>{loads++;return load();},release:()=>{releases++;},
    anchor:()=>({stand:[0,0,0],target:[.4,1,0],yaw:0}),reachable:()=>near,busy:()=>!!action,
    carried:()=>carried,clearCarry:()=>{carried=null;},
    begin:(kind,anchor,contact,cancel)=>{if(action||!near)return false;action={kind,contact,cancel};return true;},
    cancel:()=>{const previous=action;action=null;previous?.cancel?.();},
  });
  return {play,get action(){return action;},get carried(){return carried;},get loads(){return loads;},get releases(){return releases;},
    source:value=>{source=value;},loader:value=>{load=value;},near:value=>{near=value;},
    commit:()=>{assert.ok(action,'a physical action was reserved');const a=action,accepted=a.contact();action=null;
      if(accepted!==false){if(a.kind==='pickup')carried='ticket';if(a.kind==='insert')carried=null;if(a.kind==='collect')carried='receipt';}return accepted;},
  };
}
async function start(f) {assert.equal(await f.play.request('archive'),true);assert.equal(f.play.store.getState().round,null);assert.equal(f.commit(),true);}

test('mount is inert; first request loads only and requires a second local pickup after readiness',async()=>{
  const f=fixture('closed'),gate=deferred();f.loader(()=>gate.promise);
  assert.equal(f.loads,0);const pending=f.play.request('archive');assert.equal(f.loads,1);assert.equal(f.action,null);
  f.source({phase:'open',history:days(),error:null});gate.resolve();await pending;
  assert.equal(f.play.store.getState().notice,'history-ready');assert.equal(f.action,null);assert.equal(f.play.store.getState().round,null);
  await start(f);assert.equal(f.play.store.getState().round.phase,'ticket');
});
test('release rejects stale history completion and cancellation rejects old contact callbacks',async()=>{
  const f=fixture('closed'),gate=deferred();f.loader(()=>gate.promise);const pending=f.play.request('archive');
  f.play.release();f.source({phase:'open',history:days(),error:null});gate.resolve();await pending;
  assert.equal(f.releases,1);assert.equal(f.play.store.getState().notice,'cancelled');assert.equal(f.action,null);
  await f.play.request('archive');const old=f.action;assert.equal(f.play.store.getState().round,null);
  f.play.cancel('recovery');assert.equal(old.contact(),false);assert.equal(f.play.store.getState().round,null);assert.equal(f.carried,null);
});
test('source failure is retained and a new explicit archive request can retry without fabricated data',async()=>{
  const f=fixture('closed');f.loader(async()=>{throw new Error('offline');});await f.play.request('archive');
  assert.equal(f.play.store.getState().notice,'error');assert.equal(f.play.store.getState().error,'offline');assert.equal(f.play.store.getState().round,null);
  f.loader(async()=>{f.source({phase:'open',history:days(),error:null});});await f.play.request('archive');
  assert.equal(f.loads,2);assert.equal(f.action,null);await start(f);
});
test('wrong stages, distant clicks and duplicate contacts never commit a round change',async()=>{
  const f=fixture();assert.equal(f.play.adjust(30),false);assert.equal(f.play.request('bell'),false);await start(f);
  assert.equal(f.play.adjust(30),false);assert.equal(f.play.request('desk'),true);const insert=f.action;
  assert.equal(f.play.store.getState().round.phase,'ticket');assert.equal(f.play.request('desk'),false);f.commit();
  assert.equal(insert.contact(),false);assert.equal(f.play.store.getState().round.phase,'selecting');
  f.near(false);assert.equal(f.play.adjust(30),false);f.near(true);assert.equal(f.play.adjust(15),false);
  assert.equal(f.play.adjust(30),true);assert.equal(f.play.store.getState().round.targetUnits,0);const adjust=f.action;f.commit();
  assert.equal(f.play.store.getState().round.targetUnits,30);assert.equal(adjust.contact(),false);
});
test('three contacts advance finite history, preserve the full receipt and replay against the previous run',async()=>{
  const f=fixture();await start(f);f.play.request('desk');f.commit();
  for(const units of [10,30,20]){
    assert.equal(f.play.adjust(units),true);f.commit();assert.equal(f.play.request('desk'),true);f.commit();
    const before=f.play.store.getState().round;assert.equal(f.play.request('bell'),true);assert.equal(f.play.store.getState().round,before);f.commit();
  }
  const clearing=f.play.store.getState().round;assert.equal(clearing.phase,'clearing');assert.equal(clearing.choices.length,3);
  assert.equal(clearing.equityTrace.length,days().length);assert.equal(f.play.request('bell'),false);
  f.play.request('clearing');assert.equal(f.play.store.getState().round.receipt,null);f.commit();
  const complete=f.play.store.getState().round;assert.equal(complete.phase,'complete');assert.equal(complete.receipt.choices.length,3);
  assert.equal(complete.receipt.equityTrace.length,12);assert.equal(f.play.request('clearing'),false);
  await f.play.request('archive');assert.equal(f.play.store.getState().round,complete);f.commit();
  const replay=f.play.store.getState().round;assert.equal(replay.phase,'ticket');assert.deepEqual(replay.previousRun,complete.receipt);
});
test('ticket returns on recovery, while inserted rounds and committed choices survive interrupted actions',async()=>{
  const f=fixture();await start(f);const ticket=f.play.store.getState().round;f.play.cancel('recovery');
  assert.equal(f.play.store.getState().round,ticket);assert.equal(f.play.store.getState().ticketReturned,true);assert.equal(f.carried,null);
  assert.equal(f.play.request('desk'),false);assert.equal(await f.play.request('archive'),true);f.commit();
  f.play.request('desk');f.commit();const inserted=f.play.store.getState().round;
  f.play.adjust(40);const old=f.action;f.play.cancel('recovery');assert.equal(old.contact(),false);
  assert.equal(f.play.store.getState().round,inserted);assert.equal(f.play.store.getState().ticketReturned,false);
  f.play.adjust(20);f.commit();const chosen=f.play.store.getState().round;f.play.cancel();assert.equal(f.play.store.getState().round,chosen);
});

test('production adapter blocks paused and distant requests, then commits through the real sampled motion contact',async()=>{
  const anchor=exchangePlayAnchor('archive');
  useAlphaExchange.setState({phase:'open',history:days(),error:null});
  Object.assign(exchangeActor,{position:[anchor.stand[0],anchor.stand[1]+PLAYER_CENTER_HEIGHT,anchor.stand[2]],yaw:anchor.yaw,available:true,grounded:true});
  useWorldStore.setState({paused:true});assert.equal(await requestExchangePlay('archive'),false);assert.equal(exchangeBody.action,null);
  useWorldStore.setState({paused:false});exchangeActor.position[0]+=10;
  assert.equal(await requestExchangePlay('archive'),false);exchangeActor.position[0]-=10;
  assert.equal(await requestExchangePlay('archive'),true);assert.equal(useExchangePlay.getState().round,null);
  for(let i=0;i<100;i++){
    const action=exchangeBody.action;
    if(action)Object.assign(exchangeVisualSockets,{valid:true,sampledId:action.id,sampledElapsed:action.elapsed,contactError:0});
    advanceExchangeBodyAction(1/60);
  }
  assert.equal(useExchangePlay.getState().round.phase,'ticket');assert.equal(exchangeBody.carried,'ticket');
  assert.equal(useExchangePlay.getState().contacts,1);assert.equal(exchangeBody.action,null);releaseExchangePlay();
});
