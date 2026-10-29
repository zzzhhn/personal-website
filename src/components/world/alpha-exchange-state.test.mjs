import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangeController, exchangeEquity } from './alpha-exchange-state.ts';
const benchmark=()=>({metadata:{acknowledgedParameters:{benchmark:'SPY'}},factor:{curve:Array.from({length:12},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,benchmark:1+i*.01}))}});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('mount is silent, bell deduplicates pending history and accepted history stays cached across reset/rings',async()=>{
  const gate=defer();let calls=0;const c=createExchangeController(()=>{calls++;return gate.promise;});
  assert.equal(calls,0);c.act('buy');assert.equal(c.store.getState().units,0);
  const a=c.ring(),b=c.ring();assert.equal(a,b);assert.equal(calls,1);gate.resolve(benchmark());await a;
  assert.equal(c.store.getState().phase,'open');c.act('buy');c.act('next');c.act('reset');await c.ring();
  assert.equal(calls,1);assert.equal(c.store.getState().day,0);assert.equal(c.store.getState().cash,10000);assert.equal(c.store.getState().units,0);
});
test('buy / next historical day / sell preserves cash plus mark-to-market and realized P/L',async()=>{
  const c=createExchangeController(async()=>benchmark());await c.ring();c.act('buy');let s=c.store.getState();
  assert.equal(s.units,10);assert.equal(s.cash,9000);assert.equal(exchangeEquity(s),10000);assert.equal(s.ledger[0].date,'2026-01-01');
  c.act('next');s=c.store.getState();assert.equal(s.history[s.day].value,101);assert.equal(exchangeEquity(s),10010);
  c.act('sell');s=c.store.getState();assert.equal(s.units,0);assert.equal(s.cash,10010);assert.equal(s.cost,0);assert.equal(s.realized,10);
  assert.equal(s.ledger[1].value,101);assert.equal(s.ledger[1].date,'2026-01-02');
});
test('no shorts, leverage, overspending, future dates or unbounded ledger',async()=>{
  const c=createExchangeController(async()=>benchmark());await c.ring();c.act('sell');assert.equal(c.store.getState().message,'no-shares');
  for(let i=0;i<7;i++)c.act('buy');assert.equal(c.store.getState().units,50);assert.equal(c.store.getState().message,'position-limit');
  for(let i=0;i<30;i++)c.act('next');assert.equal(c.store.getState().day,11);assert.equal(c.store.getState().message,'last-day');
  c.store.setState({cash:1,units:0,cost:0});c.act('buy');assert.equal(c.store.getState().message,'insufficient');assert.equal(c.store.getState().cash,1);
  c.act('reset');for(let i=0;i<30;i++){c.act('buy');c.act('sell');}assert.equal(c.store.getState().ledger.length,6);assert.equal(c.store.getState().cash,10000);
});
test('a partial sale retains weighted historical cost and realizes only the units sold',async()=>{
  const c=createExchangeController(async()=>benchmark());await c.ring();c.act('buy');c.act('next');c.act('buy');c.act('next');c.act('sell');
  const s=c.store.getState();assert.equal(s.units,10);assert.equal(s.cost,1005);assert.equal(s.realized,15);assert.equal(exchangeEquity(s),10030);
});
test('history error requires explicit ringing; release rejects stale listeners without cancelling shared history',async()=>{
  let calls=0;const c=createExchangeController(async()=>{calls++;throw new Error('offline');});await c.ring();
  assert.equal(c.store.getState().phase,'error');c.act('next');assert.equal(calls,1);await c.ring();assert.equal(calls,2);
  const gate=defer(),d=createExchangeController(()=>gate.promise);const pending=d.ring();d.release();gate.resolve(benchmark());await pending;
  assert.equal(d.store.getState().phase,'closed');assert.equal(d.store.getState().history.length,0);
});
