import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeBenchmarkHistory } from './alpha-exchange-data.ts';
const fixture=()=>({metadata:{acknowledgedParameters:{benchmark:'SPY'}},factor:{curve:Array.from({length:12},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,benchmark:1+i*.01,nav:99-i}))}});
test('uses only the real benchmark curve, preserving dates and normalizing NAV to 100',()=>{
  const p=fixture(),a=exchangeBenchmarkHistory(p);assert.equal(a[0].value,100);assert.ok(Math.abs(a[11].value-111)<1e-10);
  assert.equal(a[11].date,'2026-01-12');assert.equal('nav' in a[0],false);p.factor.curve[1].nav=1e99;assert.deepEqual(a,exchangeBenchmarkHistory(p));
});
test('rejects wrong benchmark, malformed dates, nonpositive or unordered NAV without fabricated fallback',()=>{
  for(const mutate of [p=>p.metadata.acknowledgedParameters.benchmark='QQQ',p=>p.factor.curve.length=2,
    p=>p.factor.curve[1].date='2026-02-30',p=>p.factor.curve[1].date='2026-01-01',p=>p.factor.curve[1].benchmark=NaN,
    p=>p.factor.curve[1].benchmark=0,p=>p.factor.curve[0].benchmark=2]){
    const p=fixture();mutate(p);assert.throws(()=>exchangeBenchmarkHistory(p));
  }
});
