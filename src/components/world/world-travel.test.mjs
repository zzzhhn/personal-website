import test from 'node:test';
import assert from 'node:assert/strict';
import { roadLandingCandidates, portalRearmed } from './world-travel.ts';
import { WORLD_PORTALS, PORTAL_THRESHOLD, portalCrossing } from './world-portals.ts';
import { advancePortalAttempt, beginPortalAttempt, retreatingFromPortal } from './portal-transfer.ts';

test('recovery candidates stay on road segments and turn the car along the road',()=>{
  const roads=[[0,1,0],[0,2,20],[20,2,20]];
  const candidates=roadLandingCandidates([1,-3,9],roads);
  assert.deepEqual(candidates[0].position,[0,1.45,9]);
  assert.equal(candidates[0].yaw,-Math.PI/2);
  for(const c of candidates){
    const [x,y,z]=c.position;
    assert.ok((x===0&&z>=0&&z<=20&&Math.abs(y-1-z/20)<1e-8)||(z===20&&x>=0&&x<=20&&y===2));
    assert.ok(Math.abs(c.yaw-(x===0?-Math.PI/2:0))<1e-8);
  }
});
const world=(g,x,y,z)=>[g.position[0]+Math.cos(g.yaw)*x+Math.sin(g.yaw)*z,g.position[1]+y,g.position[2]-Math.sin(g.yaw)*x+Math.cos(g.yaw)*z];
for(const g of WORLD_PORTALS){
  test(`${g.id} accepts both walking directions and a fast swept crossing only within its opening`,()=>{
    const y=PORTAL_THRESHOLD.top+.82;
    const a=world(g,0,y,.1),b=world(g,0,y,-.1);
    assert.ok(portalCrossing(g,a,b)); assert.ok(portalCrossing(g,b,a));
    assert.ok(portalCrossing(g,world(g,0,y,2),world(g,0,y,-2)));
    assert.equal(portalCrossing(g,a,world(g,0,y,.02)),false);
    assert.equal(portalCrossing(g,world(g,1.1,y,.1),world(g,1.1,y,-.1)),false);
    assert.equal(portalCrossing(g,world(g,0,3,.1),world(g,0,3,-.1)),false);
    assert.equal(portalCrossing(g,[NaN,0,0],b),false);
  });
}
test('arrival cooldown alone cannot bounce a player through the same gate',()=>{
  for(const g of WORLD_PORTALS){
    const arrival=g.arrivalCandidates[0];
    assert.equal(portalRearmed(0,arrival,WORLD_PORTALS),false);
    const away=world(g,0,.82,4);
    assert.equal(portalRearmed(1,away,WORLD_PORTALS),false);
    assert.equal(portalRearmed(0,away,WORLD_PORTALS),true);
  }
});

test('every entry can first select each of the other four gates, including a cold gate', () => {
  for (const from of WORLD_PORTALS) {
    const choices = WORLD_PORTALS.filter(gate => gate !== from);
    for (let i = 0; i < choices.length; i++) {
      const trip = beginPortalAttempt(from, from.entryApproachCandidates[0], WORLD_PORTALS, (i + .5) / choices.length);
      assert.equal(trip.destinations[0], choices[i]);
      assert.equal(new Set(trip.destinations).size, 4);
      assert.ok(trip.destinations.every(gate => gate !== from));
    }
  }
});

test('a cold first exit retains priority, a failure opens a safe fallback and an expired request cannot stall that fallback', () => {
  const [camp, mine, , , coaster] = WORLD_PORTALS;
  const start = () => beginPortalAttempt(camp, camp.entryApproachCandidates[0], WORLD_PORTALS, .99);
  const cold = { status: 'loading', regions: ['real-station'] };
  const ready = landing => ({ status: 'ready', landing });
  const trip = start();
  assert.deepEqual(advancePortalAttempt(trip, 1, gate => {
    assert.equal(gate, coaster); return cold;
  }), cold);
  assert.equal(trip.cursor, 0);
  assert.deepEqual(advancePortalAttempt(trip, 1, gate => ready(gate.arrivalCandidates[0])),
    { status: 'arrived', destination: coaster, landing: coaster.arrivalCandidates[0], fallback: false });
  const inspect = gate => gate === coaster ? { status: 'blocked' } : ready(gate.arrivalCandidates[0]);
  assert.deepEqual(advancePortalAttempt(start(), .1, inspect),
    { status: 'arrived', destination: mine, landing: mine.arrivalCandidates[0], fallback: true });
  assert.equal(advancePortalAttempt(start(), 8, gate => gate === coaster ? cold : inspect(gate)).destination, mine);
  assert.deepEqual(advancePortalAttempt(start(), 8, () => cold), { status: 'blocked' });
});

test('retreat uses the gate frame and the actual approach side', () => {
  for (const gate of WORLD_PORTALS) for (const sign of [-1, 1]) {
    const trip = beginPortalAttempt(gate, world(gate, 0, 1.37, sign), WORLD_PORTALS, .5);
    assert.equal(retreatingFromPortal(trip, 0, 0), false);
    assert.equal(retreatingFromPortal(trip, Math.sin(gate.yaw) * sign, Math.cos(gate.yaw) * sign), true);
    assert.equal(retreatingFromPortal(trip, -Math.sin(gate.yaw) * sign, -Math.cos(gate.yaw) * sign), false);
  }
});
