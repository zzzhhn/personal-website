import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_ALL_CLEAR, IBD_SHORT_PACK, IBD_WRONG_SPEC } from './ibd-cases.ts';
import { createIbdPackInspection, reduceIbdPackInspection, ibdPackInspectionComplete, ibdPackInspectionReading } from './ibd-pack-inspection.ts';
const item = (scenario = IBD_ALL_CLEAR) => scenario.items.find(value => value.id === 'parts-b');
const event = (state, type, slot = 0, extra = {}) => reduceIbdPackInspection(state, { type, itemId: state.itemId, slot, contact: true, aligned: true, visible: true, ...extra });
const inspect = (state, slot) => state.slots[slot].present ? event(event(event(state,'take',slot),'measure',slot),'return',slot) : event(state,'view-empty',slot);

test('four slots follow real quantity and specification and accept any inspection order', () => {
  for (const scenario of [IBD_ALL_CLEAR,IBD_SHORT_PACK,IBD_WRONG_SPEC]) {
    let state=createIbdPackInspection(item(scenario));
    assert.equal(state.slots.length,4); assert.equal(state.slots.filter(slot=>slot.present).length,item(scenario).quantity);
    assert.equal(ibdPackInspectionReading(state),null);
    for(const slot of [2,0,3,1]) state=inspect(state,slot);
    assert.equal(ibdPackInspectionComplete(state),true);
    assert.deepEqual(ibdPackInspectionReading(state),{quantity:item(scenario).quantity,specIds:[item(scenario).specId]});
  }
});

test('present slots require take, real aligned clamp contact and return to their own pocket', () => {
  let state=createIbdPackInspection(item());
  assert.equal(event(state,'measure').notice,'take-first'); assert.equal(event(state,'return').notice,'take-first');
  state=event(state,'take',0,{contact:false}); assert.equal(state.held,null); assert.equal(state.notice,'contact-missing');
  state=event(state,'take'); assert.equal(state.held,0);
  assert.equal(event(state,'take',1).notice,'return-first');
  state=event(state,'measure',0,{contact:false}); assert.equal(state.measurement,null);
  state=event(state,'measure',0,{aligned:false}); assert.equal(state.measurement,null); assert.equal(state.notice,'clamp-misaligned');
  assert.equal(event(state,'return').notice,'measure-first');
  state=event(state,'measure'); assert.equal(state.measurement,'M8'); assert.equal(state.slots[0].complete,false);
  assert.equal(event(state,'return',1).notice,'wrong-slot');
  state=event(state,'return',0,{contact:false}); assert.equal(state.held,0); assert.equal(state.slots[0].complete,false);
  state=event(state,'return'); assert.equal(state.held,null); assert.equal(state.slots[0].complete,true); assert.equal(state.slots[0].reading,'M8');
});

test('empty pockets require a visible inspection and cannot masquerade as a measured sample', () => {
  let state=createIbdPackInspection(item(IBD_SHORT_PACK));
  assert.equal(event(state,'take',3).notice,'empty-slot'); assert.equal(event(state,'view-empty',0).notice,'sample-present');
  state=event(state,'view-empty',3,{visible:false}); assert.equal(state.slots[3].complete,false);
  state=event(state,'view-empty',3); assert.equal(state.slots[3].complete,true); assert.equal(state.slots[3].reading,null);
  assert.strictEqual(event(state,'view-empty',3),state);
});

test('repeats are bounded and cancel restores the held part while preserving completed pockets', () => {
  const initial=createIbdPackInspection(item()), snapshot=JSON.stringify(initial);
  let state=inspect(initial,2);
  for(let i=0;i<30;i++) state=inspect(state,2);
  assert.equal(state.slots.filter(slot=>slot.complete).length,1);
  state=event(event(state,'take',1),'measure',1); state=event(state,'cancel');
  assert.equal(state.held,null); assert.equal(state.measurement,null); assert.equal(state.slots[1].complete,false); assert.equal(state.slots[2].complete,true);
  assert.strictEqual(event(state,'cancel'),state); assert.equal(JSON.stringify(initial),snapshot);
  assert.equal(state.slots.length,4);
});

test('unknown identities, malformed slots and unsupported fixtures cannot produce readings', () => {
  const state=createIbdPackInspection(item());
  assert.equal(event(state,'take',0,{itemId:'parts-b:replacement'}).notice,'unknown-item');
  for(const slot of [-1,4,1.2,NaN,'0']) assert.equal(event(state,'take',slot).notice,'unknown-slot');
  for(const fixture of [undefined,IBD_ALL_CLEAR.items[0],{...item(),quantity:5},{...item(),quantity:-1},{...item(),quantity:1.5}])
    assert.throws(()=>createIbdPackInspection(fixture));
  assert.equal(ibdPackInspectionReading(state),null);
});
