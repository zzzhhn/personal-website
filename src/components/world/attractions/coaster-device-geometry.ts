import { COASTER_PALETTE as P, CoasterBatch } from './coaster-geometry';
import { coasterWorld } from './coaster-track';
import { INTENT_CRAFT, markIntentCraft } from './intent-craft-surface';
import type { Vec3 } from '../types';

export function createIntentChestBody(passed: readonly string[]) {
  const b = new CoasterBatch(coasterWorld([-8, 0, 59.5]));
  const panel = (at: Vec3, size: Vec3, tint: string, role: number) => {
    b.box(at, size, tint);
    markIntentCraft(b.parts[b.parts.length - 1], role);
  };
  const { structuralCoat: coat, galvanized: edge, rubber } = INTENT_CRAFT;
  panel([0,.17,0],[3.68,.19,1.98],P.dark,coat);
  panel([0,.30,0],[3.8,.12,2.10],P.steel,coat);
  for (const side of [-1,1]) {
    panel([side*1.82,.75,0],[.16,.96,2.10],P.steel,coat);
    panel([0,.75,side*.969],[3.48,.96,.162],P.dark,coat);
    panel([side*1.76,1.208,0],[.28,.06,2.16],P.rail,edge);
    panel([0,1.208,side*.967],[3.24,.06,.226],P.rail,edge);
  }
  panel([0,.39,0],[3.43,.08,1.77],'#283b46',rubber);
  panel([0,.58,1.057],[3.45,.58,.044],'#4e6570',coat);
  for (let i = 0; i < 6; i++) {
    const x = -1.38 + i * .55, opened = i < passed.length;
    b.box([x, .55, 1.1], [.34, .36, .15], opened ? P.cyan : P.gold);
    b.beam([x - .12, .72, 1.12], [x - .12, .92, 1.12], .035, opened ? P.cyan : P.gold);
    b.beam([x - .12, .92, 1.12], [x + .12, .92, opened ? 1.32 : 1.12], .035, opened ? P.cyan : P.gold);
    if (!opened) b.beam([x + .12, .92, 1.12], [x + .12, .72, 1.12], .035, P.gold);
  }
  for (let i = 0; i < 7; i++) b.box([-1.5 + i * .5, 1.04, 1.07], [.18, .1, .05], passed.includes(`T${i + 1}`) ? P.cyan : P.steel);
  return b.finish();
}

export function createIntentChestLid() {
  const b = new CoasterBatch(coasterWorld([-8, 1.23, 58.5]));
  b.housing([0,.095,1],[3.9,.19,2.2],P.copper);
  markIntentCraft(b.parts[b.parts.length - 1], INTENT_CRAFT.structuralCoat);
  b.box([0,.011,1],[3.73,.022,2.03],P.steel);
  markIntentCraft(b.parts[b.parts.length - 1], INTENT_CRAFT.structuralCoat);
  b.box([0,.045,2.085],[3.82,.085,.03],P.rail);
  markIntentCraft(b.parts[b.parts.length - 1], INTENT_CRAFT.galvanized);
  return b.finish();
}

export function createIntentKey() {
  const b = new CoasterBatch();
  b.beam([0, 0, 0], [.65, 0, 0], .06, P.gold);
  b.beam([.5, 0, 0], [.5, -.17, 0], .045, P.gold);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, c = (i + 1) / 6 * Math.PI * 2;
    b.beam([Math.cos(a) * .18 - .18, Math.sin(a) * .18, 0], [Math.cos(c) * .18 - .18, Math.sin(c) * .18, 0], .045, P.gold);
  }
  for (const part of b.parts) markIntentCraft(part, INTENT_CRAFT.galvanized);
  return b.finish();
}

export function createIntentGateLeaf() {
  const b = new CoasterBatch();
  const member = (at: Vec3, size: Vec3, pigment = P.steel, finish: number = INTENT_CRAFT.structuralCoat) => {
    b.box(at, size, pigment);
    markIntentCraft(b.parts[b.parts.length - 1], finish);
  };
  member([2.5,.48,0],[5,.76,.25],P.dark);
  for (const z of [-.129,.129]) {
    member([2.5,.54,z],[4.74,.58,.036],'#526771');
    member([2.5,.78,z],[4.81,.055,.046],P.rail,INTENT_CRAFT.galvanized);
  }
  for (const x of [.08,4.92]) member([x,1.63,0],[.18,3.06,.25]);
  for (let x=.46; x<4.9; x+=.46) member([x,1.91,0],[.085,2.2,.13]);
  member([2.5,3.1,0],[5.15,.18,.30],P.copper);
  b.beam([.09,.8,0],[4.91,2.96,0],.075,P.steel);
  markIntentCraft(b.parts[b.parts.length - 1],INTENT_CRAFT.structuralCoat);
  for (const y of [.47,2.65]) {
    b.beam([0,y-.12,0],[0,y+.12,0],.12,P.rail,8);
    markIntentCraft(b.parts[b.parts.length - 1],INTENT_CRAFT.galvanized);
  }
  return b.finish();
}
