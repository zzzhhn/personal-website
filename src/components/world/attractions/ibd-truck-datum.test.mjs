import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_YARD_PAVING_Y, IBD_TRUCK_MODEL_WHEEL_Y, IBD_TRUCK_WHEEL_RADIUS, IBD_TRUCK_MODEL_FLOOR,
  IBD_TRUCK_GROUND_LIFT, IBD_TRUCK_FLOOR, groundIbdTruckBody, ibdTruckLoadingRamp } from './ibd-truck-datum.ts';
import { IBD_TRUCK_WHEELS, IBD_TRUCK, IBD_CARGO_HOME, IBD_STATIONS } from './ibd-yard-layout.ts';
import { IBD_FIXTURES } from './ibd-yard-lighting.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdCargoRoutes, ibdPhysicalCargoPose } from './ibd-yard-motion.ts';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('one paving datum removes the original 6.5 cm six-wheel overlap', () => {
  near(IBD_TRUCK_MODEL_WHEEL_Y-IBD_TRUCK_WHEEL_RADIUS-IBD_YARD_PAVING_Y,-.065);
  near(IBD_TRUCK_GROUND_LIFT,.065);
  for(const z of IBD_TRUCK_WHEELS.axles) for(const side of [-1,1]) {
    assert.ok(Number.isFinite(z+side*IBD_TRUCK_WHEELS.halfTrack));
    near(IBD_TRUCK_WHEELS.centerY-IBD_TRUCK_WHEELS.radius,IBD_YARD_PAVING_Y);
  }
  near(IBD_TRUCK_FLOOR-IBD_TRUCK_MODEL_FLOOR,IBD_TRUCK_GROUND_LIFT);
});

test('production body placement moves appended visible vertices and solids together, preserving the yard prefix', () => {
  const prefix = [1,2,3], body = [16,1.2,10.5,16,.02,14.5,18,3.9,12.5], positions = [...prefix,...body];
  const yard = {at:[1,2,3],size:[1,1,1]}, truck = {at:[16,1.05,12.5],size:[4,.3,9]}, solids = [yard,truck];
  groundIbdTruckBody(positions,prefix.length,solids,1);
  assert.deepEqual(positions.slice(0,3),prefix);
  assert.deepEqual(yard,{at:[1,2,3],size:[1,1,1]});
  for(let i=0;i<body.length;i++)near(positions[i+3]-body[i],i%3===1?IBD_TRUCK_GROUND_LIFT:0);
  near(truck.at[1],1.05+IBD_TRUCK_GROUND_LIFT);
  assert.deepEqual(truck.size,[4,.3,9]);
});

test('loading ramps keep their landward end buried and reach the new truck datum below 25 degrees', () => {
  for(const z of [10.5,14.5]) {
    const ramp=ibdTruckLoadingRamp(z), angle=ramp.rotation[2], length=ramp.size[0];
    near(ramp.at[1]-Math.sin(angle)*length/2,0);
    near(ramp.at[1]+Math.sin(angle)*length/2,IBD_TRUCK_FLOOR);
    assert.ok(Math.cos(angle)*ramp.size[1]/2<IBD_YARD_PAVING_Y,'visible lower ramp face must stay embedded in paving');
    assert.ok(angle<25*Math.PI/180);
  }
});

test('cargo routes, physical poses and truck-mounted fixtures share the raised floor while ground controls stay put', () => {
  for(const slot of ['parts-a','parts-b']) {
    near(IBD_TRUCK[slot][1]-IBD_TRUCK_FLOOR,1.1);
    for(const kind of ['load','unload']) {
      const game=createIbdYardGame();game.pending={token:1,seconds:3,action:{kind,slot,station:slot==='parts-a'?'load-a':'load-b'}};
      const points=ibdCargoRoutes(game,slot)[0].points;
      assert.deepEqual(points[kind==='load'?points.length-1:0],IBD_TRUCK[slot]);
      assert.deepEqual(ibdPhysicalCargoPose(game,slot,1).at,kind==='load'?IBD_TRUCK[slot]:IBD_CARGO_HOME[slot]);
    }
    const fixture=IBD_FIXTURES.find(f=>f.mount==='truck'&&f.at[2]===IBD_TRUCK[slot][2]);
    near(fixture.at[1]-IBD_TRUCK_FLOOR,3.805-IBD_TRUCK_MODEL_FLOOR);
    near(fixture.aim[1]-IBD_TRUCK_FLOOR,1.6-IBD_TRUCK_MODEL_FLOOR);
  }
  for(const id of ['load-a','load-b','truck-a','truck-b','dispatch'])near(IBD_STATIONS.find(s=>s.id===id).at[1],1.1);
});
