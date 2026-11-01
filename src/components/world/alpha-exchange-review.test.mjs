import test from 'node:test';
import assert from 'node:assert/strict';
import {createExchangeRound,reduceExchangeRound as reduce} from './alpha-exchange-round.ts';
import {exchangeReview,exchangePreviousMarks} from './alpha-exchange-review.ts';
const history=[100,101,102,110,111,112,90,91,92,120].map((value,day)=>({value,date:`2026-01-${String(day+1).padStart(2,'0')}`}));
const choose=(r,units)=>reduce(reduce(reduce(r,{type:'target',units}),{type:'seal'}),{type:'ring'});
function complete(units){let r=reduce(createExchangeRound(history),{type:'insert'});for(let i=0;i<3;i++)r=choose(r,units);return reduce(r,{type:'collect'});}

test('review attributes interval gains to exposure, compares matching dates and never exposes an unvisited interval',()=>{
  let r=reduce(reduce(complete(10),{type:'replay'}),{type:'insert'});r=choose(r,20);
  const first=exchangeReview(r,0);
  assert.equal(first.pnl,200);assert.equal(first.previousPnl,100);assert.equal(first.difference,100);assert.equal(first.returnPct,2);
  assert.deepEqual(first.marks.map(m=>m.date),history.slice(0,4).map(m=>m.date));assert.equal(first.previous.length,4);
  assert.equal(exchangeReview(r,1),null);assert.equal(exchangeReview(r,null),null);assert.equal(exchangeReview(r,-1),null);
  const poisoned=structuredClone(r);for(const m of poisoned.previousRun.equityTrace)if(m.day>r.day)m.equity=999999999;
  for(const m of poisoned.history.slice(r.day+1))m.value=999999;
  poisoned.previousRun.finalEquity=999999999;
  assert.deepEqual(exchangeReview(poisoned,0),first);
  const mark=exchangePreviousMarks(poisoned,[r.equityTrace.at(-1)])[0];assert.equal(mark.equity,10100);
  r=choose(r,0);const second=exchangeReview(r,1);assert.equal(second.pnl,0);assert.equal(second.previousPnl,-200);assert.equal(second.difference,200);
});
test('missing or different dated prices do not produce a comparison; returned traces cannot mutate receipts',()=>{
  const prior=complete(10);let r=choose(reduce(createExchangeRound(history,prior.receipt),{type:'insert'}),20);
  const review=exchangeReview(r,0);review.previous[0].equity=0;review.marks[0].equity=0;
  assert.equal(r.equityTrace[0].equity,10000);assert.equal(r.previousRun.equityTrace[0].equity,10000);
  r.previousRun.equityTrace[1].value+=1;assert.equal(exchangeReview(r,0).previous,null);
  r.previousRun.equityTrace.splice(1,1);assert.equal(exchangeReview(r,0).previousPnl,null);
  assert.equal(exchangePreviousMarks(r,[prior.equityTrace.at(-1)]),null);
});
test('one-day and first-run reviews are finite and describe only the available interval',()=>{
  const r=choose(reduce(createExchangeRound(history.slice(0,1)),{type:'insert'}),0),v=exchangeReview(r,0);
  assert.equal(v.pnl,0);assert.equal(v.returnPct,0);assert.equal(v.previous,null);assert.equal(v.marks.length,1);
  assert.equal(exchangeReview(r,1),null);
});
