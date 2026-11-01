import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_CASES } from './ibd-cases.ts';
import { assessIbd } from './ibd-model.ts';
import { createIbdYardGame, yardCase, yardActions, yardItemId, requestIbdYardAction, finishIbdYardAction, cancelIbdYardAction, inspectIbdYardPack, canCancelIbdObservation } from './ibd-yard-game.ts';
import { ibdStation, IBD_STATIONS, IBD_CARGO_HOME } from './ibd-yard-layout.ts';
import { advanceIbdMotion, ibdCargoPose } from './ibd-yard-motion.ts';
import { playerVerdict } from './ibd-test-player.mjs';
import { ibdStockItem } from './ibd-stock.ts';

const actor = (g, station) => ({ active: true, local: ibdStation(station, g.core.moved).at });
function act(g, station, kind) {
  if (kind === 'contents') return inspectPack(g,station);
  const action = yardActions(g, station).find(a => !kind || a.kind === kind);
  assert.ok(action, `${station}/${kind} unavailable`);
  const answer = action.kind === 'judge' && action.itemId.startsWith('reserve:') ? { ...action, verdict: 'matches' } : playerVerdict(g, action);
  const next = requestIbdYardAction(g, answer, actor(g, station));
  return next.pending ? finishIbdYardAction(next, next.pending.token, actor(g, station)) : next;
}
function chooseCorrectStock(g) {
  const key = ['stock-a', 'stock-b'].find(key => ibdStockItem(g.round, g.caseIndex, key).specId === 'M8');
  return act(g, key, 'select-stock');
}
function packEvent(g,station,type,slot=0,extra={}) {
  return inspectIbdYardPack(g,{type,itemId:yardItemId(g,station),slot,contact:true,aligned:true,visible:true,round:g.round,revision:g.revision,...extra},actor(g,station));
}
function inspectPack(g,station) {
  const item=yardCase(g).items.find(item=>item.id===yardItemId(g,station));
  for(const slot of [2,0,3,1]) {
    if(slot>=item.quantity) g=packEvent(g,station,'view-empty',slot);
    else { g=packEvent(g,station,'take',slot); g=packEvent(g,station,'measure',slot); g=packEvent(g,station,'return',slot); }
  }
  return g;
}
function prepare(index = 0, route = 'gallery') {
  let g = act(act(createIbdYardGame(index), 'manifest'), 'kit');
  if (route === 'gallery') {
    g = act(g, 'gallery-front'); g = act(g, 'gallery-rear');
  } else {
    g = act(g, 'crane');
    for (const side of ['front', 'rear']) {
      g = act(g, `coil-${side}`, 'scan'); g = act(g, `turn-${side}`); g = act(g, `coil-${side}`, 'rear');
    }
  }
  for (const side of ['a', 'b']) { g = act(g, `parts-${side}`, 'open'); g = act(g, `parts-${side}`, 'contents'); }
  for (const slot of ['coil-front', 'coil-rear', 'parts-a', 'parts-b']) g = act(g, slot, 'judge');
  return g;
}
function dispatch(g) {
  for (const side of ['a', 'b']) g = act(g, `load-${side}`);
  g = act(g, 'dispatch', 'verify');
  assert.equal(assessIbd(yardCase(g), g.core).status, 'clear');
  return act(g, 'dispatch', 'release');
}

test('complete all-clear shipment works by gallery and crane routes, with no invented discrepancy', () => {
  for (const route of ['gallery', 'floor']) {
    const g = dispatch(prepare(0, route));
    assert.equal(g.released, true); assert.deepEqual(g.exchanges, []);
    assert.equal(g.core.loaded.length, 2); assert.equal(g.core.shipmentConfirmed, true);
  }
});
test('each anomaly can be corrected and a fresh identity must be inspected before release', () => {
  const original = JSON.stringify(IBD_CASES);
  for (const index of [1, 2, 3]) {
    let g = prepare(index); const slot = index === 2 ? 'coil-rear' : 'parts-b';
    assert.equal(assessIbd(yardCase(g), g.core).inventory.status, 'different');
    if (index === 2) { assert.equal(act(g, slot, 'replace').notice, 'clear-exchange-lane'); g = act(g, 'crane'); }
    g = act(g, slot, 'replace');
    if (index === 2) {
      assert.equal(g.exchanges.length, 1); assert.equal(g.exchanges[0].original.id, slot);
      assert.ok(g.exchanges[0].proofs.length >= 4);
    } else {
      assert.equal(g.exchanges.length, 0); assert.equal(g.stock.originalReturned, true);
      assert.deepEqual(yardActions(g, 'parts-b'), []); g = chooseCorrectStock(g);
    }
    assert.notEqual(yardItemId(g, slot), slot);
    assert.equal(assessIbd(yardCase(g), g.core).inventory.status, 'insufficient');
    if (index === 2) g = act(g, 'gallery-rear');
    else { g = act(g, 'parts-b', 'open'); g = act(g, 'parts-b', 'contents'); }
    g = act(g, slot, 'judge');
    g = dispatch(g); assert.equal(g.released, true);
  }
  assert.equal(JSON.stringify(IBD_CASES), original);
});
test('wrong load remains physical, unload invalidates confirmation, then correction can finish', () => {
  let g = prepare(1); g = act(g, 'load-a'); g = act(g, 'load-b'); g = act(g, 'dispatch', 'verify');
  assert.equal(g.notice, 'check-different'); assert.equal(g.released, false);
  assert.equal(yardActions(g, 'parts-b').length, 0);
  g = act(g, 'truck-b'); assert.equal(g.core.shipmentConfirmed, false);
  g = chooseCorrectStock(act(g, 'parts-b', 'replace')); g = act(g, 'parts-b', 'open'); g = act(g, 'parts-b', 'contents');
  g = act(g, 'parts-b', 'judge');
  g = act(g, 'load-b'); g = act(g, 'dispatch', 'verify'); g = act(g, 'dispatch', 'release');
  assert.equal(g.released, true); assert.equal(new Set(g.core.loaded).size, 2);
});
test('a truck with missing cargo cannot clear and the player can simply load the missing pallet', () => {
  let g = prepare(); g = act(g, 'load-a'); g = act(g, 'dispatch', 'verify');
  assert.equal(g.notice, 'check-different');
  g = act(g, 'load-b'); g = act(g, 'dispatch', 'verify');
  assert.equal(g.notice, 'check-clear'); assert.equal(act(g, 'dispatch', 'release').released, true);
});
test('remote, forged, inactive, hidden and paused interactions cannot produce evidence', () => {
  const g = prepare(), action = yardActions(g, 'dispatch')[0];
  assert.equal(requestIbdYardAction(g, action, { active: true, local: [0, 0, 27] }).notice, 'out-of-reach');
  for (const flag of ['paused', 'hidden', 'driving']) assert.equal(requestIbdYardAction(g, action, { ...actor(g, 'dispatch'), [flag]: true }), g);
  assert.equal(requestIbdYardAction(g, action, { ...actor(g, 'dispatch'), active: false }), g);
  assert.equal(requestIbdYardAction(g, { kind: 'release', station: 'dispatch' }, actor(g, 'dispatch')).notice, 'action-unavailable');
  assert.equal(requestIbdYardAction(g, { kind: 'survey', station: 'gallery-front', slot: 'parts-a' }, actor(g, 'gallery-front')).notice, 'action-unavailable');
});
test('sealed packs, rear faces and occluded coils keep their action prerequisites', () => {
  let g = act(act(createIbdYardGame(), 'manifest'), 'kit');
  assert.equal(act(g, 'turn-front').notice, 'front-first');
  g = act(g, 'scale-b'); assert.deepEqual(g.core.proofs, {}); assert.equal(g.notice, 'weigh');
  assert.equal(act(g, 'coil-rear', 'scan').notice, 'occluded');
  g = act(g, 'coil-front', 'scan'); assert.equal(act(g, 'coil-front', 'rear').notice, 'turn-or-change-view');
  assert.equal(yardActions(g, 'parts-b')[0].kind, 'open');
  const low = { active: true, local: [-10, .1, -13.5] };
  assert.equal(requestIbdYardAction(g, yardActions(g, 'gallery-rear')[0], low).notice, 'out-of-reach');
});
test('actions commit only at completion, pause freezes time, and walking away cancels an observation', () => {
  const g = act(act(createIbdYardGame(), 'manifest'), 'kit'), action = yardActions(g, 'parts-a')[0];
  const busy = requestIbdYardAction(g, action, actor(g, 'parts-a'));
  assert.deepEqual(busy.core.opened, []); assert.equal(requestIbdYardAction(busy, action, actor(g, 'parts-a')).notice, 'busy');
  assert.equal(finishIbdYardAction(busy, busy.pending.token, { ...actor(g, 'parts-a'), paused: true }), busy);
  assert.equal(advanceIbdMotion(.2, 100, 2, false), .2); assert.equal(advanceIbdMotion(.2, 100, 2, true), .25);
  const away = finishIbdYardAction(busy, busy.pending.token, { active: true, local: [0, 0, 0] });
  assert.equal(away.notice, 'walked-away'); assert.deepEqual(away.core.opened, []);
  assert.equal(finishIbdYardAction(cancelIbdYardAction(busy), busy.pending.token, actor(g, 'parts-a')).core.opened.length, 0);
});
test('replay resets cargo/evidence without touching the source and cycles through every fictional case', () => {
  let g = dispatch(prepare());
  for (let i = 1; i <= 4; i++) {
    g = act(g, i === 1 ? 'dispatch' : 'manifest', 'next');
    assert.equal(g.caseIndex, i % 4); assert.equal(g.released, false); assert.deepEqual(g.core.loaded, []);
    assert.deepEqual(g.core.proofs, {}); assert.deepEqual(g.exchanges, []);
    if (i < 4) g = act(g, 'manifest', 'brief');
  }
});
test('cargo has continuous motion endpoints; crane actually raises and moves the front coil', () => {
  let g = act(act(createIbdYardGame(), 'manifest'), 'kit');
  g = requestIbdYardAction(g, yardActions(g, 'crane')[0], actor(g, 'crane'));
  assert.deepEqual(ibdCargoPose(g, 'coil-front', 0).at, IBD_CARGO_HOME['coil-front']);
  assert.ok(ibdCargoPose(g, 'coil-front', .5).at[1] > IBD_CARGO_HOME['coil-front'][1] + 1);
  assert.deepEqual(ibdCargoPose(g, 'coil-front', 1).at, [-20, 2.35, -4]);
  assert.ok(IBD_STATIONS.every(s => Math.abs(s.at[0]) <= 34 && Math.abs(s.at[2]) <= 30));
});

test('one contents action cannot grant evidence, and slot events retain real physical prerequisites', () => {
  let g=act(act(createIbdYardGame(),'manifest'),'kit');
  assert.equal(packEvent(g,'parts-a','take').notice,'package-sealed');
  g=act(g,'parts-a','open');
  const contents=yardActions(g,'parts-a').find(action=>action.kind==='contents');
  const refused=requestIbdYardAction(g,contents,actor(g,'parts-a'));
  assert.equal(refused.notice,'pack-inspection-incomplete'); assert.equal(refused.pending,null); assert.deepEqual(refused.core.proofs,{});
  g=packEvent(g,'parts-a','take',0,{contact:false}); assert.equal(g.packInspections['parts-a'].held,null);
  g=packEvent(g,'parts-a','take'); g=packEvent(g,'parts-a','measure',0,{aligned:false});
  assert.equal(g.packInspections['parts-a'].measurement,null); assert.deepEqual(g.core.proofs,{});
  g=packEvent(g,'parts-a','measure'); g=packEvent(g,'parts-a','return');
  assert.equal(g.packInspections['parts-a'].slots[0].complete,true); assert.deepEqual(g.core.proofs,{});
  g=inspectPack(g,'parts-a'); assert.deepEqual(g.core.proofs['parts-a'],['identity','quantity','specification','quality-contents']);
});

test('cancel and walking away restore only the held sample; stale events and unknown goods are inert', () => {
  let g=act(act(createIbdYardGame(),'manifest'),'kit'); g=act(g,'parts-b','open');
  g=packEvent(packEvent(packEvent(g,'parts-b','take',2),'parts-b','measure',2),'parts-b','return',2);
  g=packEvent(g,'parts-b','take',0); const captured={type:'measure',itemId:'parts-b',slot:0,contact:true,aligned:true,round:g.round,revision:g.revision};
  g=cancelIbdYardAction(g); assert.equal(g.packInspections['parts-b'].held,null); assert.equal(g.packInspections['parts-b'].slots[2].complete,true);
  assert.strictEqual(inspectIbdYardPack(g,captured,actor(g,'parts-b')),g);
  g=packEvent(g,'parts-b','take',1);
  g=inspectIbdYardPack(g,{...captured,slot:1,revision:g.revision},{active:true,local:[0,0,0]});
  assert.equal(g.notice,'walked-away'); assert.equal(g.packInspections['parts-b'].held,null); assert.equal(g.packInspections['parts-b'].slots[2].complete,true);
  const unknown=inspectIbdYardPack(g,{...captured,itemId:'unknown',revision:g.revision},actor(g,'parts-b'));
  assert.equal(unknown.notice,'unknown-item'); assert.deepEqual(unknown.core.proofs,{});
});

test('replacement, next and reset never reuse old item pocket conclusions', () => {
  let g=prepare(1); assert.equal(g.packInspections['parts-b'].slots.filter(slot=>slot.complete).length,4);
  g=act(g,'parts-b','replace'); assert.equal(g.packInspections['parts-b'],undefined); assert.equal(g.packInspections['parts-b:replacement'],undefined);
  const old=inspectIbdYardPack(g,{type:'take',itemId:'parts-b',slot:0,contact:true,round:g.round,revision:g.revision},actor(g,'parts-b'));
  assert.equal(old.notice,'unknown-item'); g=chooseCorrectStock(g); g=act(g,'parts-b','open'); g=packEvent(g,'parts-b','take');
  assert.equal(g.packInspections[yardItemId(g,'parts-b')].slots.some(slot=>slot.complete),false);
  g=act(g,'manifest','next'); assert.deepEqual(g.packInspections,{});
  g=act(g,'manifest','reset'); assert.deepEqual(g.packInspections,{});
});

test('one held sample interlocks other machines and packs and exposes the existing cancel affordance', () => {
  let g=act(act(createIbdYardGame(),'manifest'),'kit'); g=act(g,'parts-a','open'); g=act(g,'parts-b','open');
  g=packEvent(g,'parts-a','take'); assert.equal(canCancelIbdObservation(g),true);
  assert.equal(packEvent(g,'parts-b','take').notice,'pack-return-first');
  const load=yardActions(g,'load-a')[0]; assert.equal(requestIbdYardAction(g,load,actor(g,'load-a')).notice,'pack-return-first');
  g=cancelIbdYardAction(g); assert.equal(canCancelIbdObservation(g),false);
  g=packEvent(g,'parts-b','take'); assert.equal(g.packInspections['parts-b'].held,0);
  g=act(g,'manifest','reset'); assert.deepEqual(g.packInspections,{});
});
