import { coasterWorld, COASTER_BOARD } from './coaster-track.ts';
import type { IntentClass, IntentText } from './intent-tasks.ts';
import type { Vec3 } from '../types';

export type IntentStationId = 'route' | 'press' | 'visitor';
export interface IntentStation {
  id: IntentStationId; origin: Vec3; target: Vec3; tasks: string[]; tools: IntentClass[]; title: IntentText;
}
export const INTENT_STATIONS: IntentStation[] = [
  { id: 'route', origin: [-21, 0, 38], target: coasterWorld([-21, 1.15, 39.6]), tasks: ['T1', 'T2', 'T5', 'T6'],
    tools: ['lookup', 'plan', 'debug', 'act'], title: { zh: '路线与席位', en: 'Routes & seats' } },
  { id: 'press', origin: [21, 0, 38], target: coasterWorld([21, 1.15, 39.6]), tasks: ['T3', 'T4'],
    tools: ['rewrite', 'extract', 'act'], title: { zh: '文字加工台', en: 'The word workshop' } },
  { id: 'visitor', origin: [8, 0, 44], target: coasterWorld([8, 1.15, 45.6]), tasks: ['T7'],
    tools: ['rewrite', 'lookup', 'act'], title: { zh: '一位没说清的访客', en: 'One unclear request' } },
];
export const INTENT_TARGETS = {
  route: INTENT_STATIONS[0].target, press: INTENT_STATIONS[1].target, visitor: INTENT_STATIONS[2].target,
  chest: coasterWorld([-7, 1, 35.8]), gate: coasterWorld([0, 1.3, 33.4]), board: COASTER_BOARD,
};
export type IntentTarget = keyof typeof INTENT_TARGETS;
export const intentReachRadius = (target: IntentTarget) => target === 'board' ? 3.4 : target === 'route' || target === 'press' || target === 'visitor' ? 3.6 : 3.1;
export const INTENT_TOOL_ACTIONS: Record<IntentClass, IntentText> = {
  lookup: { zh: '拨查询道岔', en: 'Switch to lookup' }, plan: { zh: '排列路线', en: 'Arrange the route' },
  debug: { zh: '检修循环', en: 'Inspect the loop' }, act: { zh: '拉执行杆', en: 'Pull the action lever' },
  rewrite: { zh: '送入改写滚筒', en: 'Feed the rewrite drum' }, extract: { zh: '压出原有字段', en: 'Stamp existing fields' },
};
export function intentInReach(position: readonly number[], target: IntentTarget) {
  const p = INTENT_TARGETS[target];
  return position.every(Number.isFinite) && Math.abs(position[1] - p[1]) < 2.4
    && Math.hypot(position[0] - p[0], position[2] - p[2]) <= intentReachRadius(target);
}
