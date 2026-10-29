import type { Vec3 } from '../types';
import { coasterWorld, COASTER_GATE_Z } from './coaster-track.ts';

// Swing into the outside forecourt, leaving the station-side return aisle clear.
export const COASTER_GATE_OPEN_ANGLE = -1.45;
export const COASTER_GATE_LEAVES = [-1, 1].map(side => ({
  side,
  hinge: coasterWorld([side * 5, 0, COASTER_GATE_Z]),
  centre: [-side * 2.5, 1.6, 0] as Vec3,
  half: [2.5, 1.6, .18] as Vec3,
}));
export const coasterGateAngle = (side: number, progress: number) => -side * COASTER_GATE_OPEN_ANGLE * progress;

/** Shared visible panels and parked contact shells; the left doorway stays open.
 * During the owned boarding/ride sequence the capsule is disabled and these
 * parked-only contacts are removed together, so the authored foot route stays valid. */
export const COASTER_CAR_PANELS: { at: Vec3; size: Vec3; color: 'copper' | 'dark' | 'steel' }[] = [
  { at: [0, .27, 0], size: [2.9, .35, 1.85], color: 'copper' },
  { at: [1.4, .65, 0], size: [.15, .55, 1.8], color: 'dark' },
  { at: [0, .64, 0], size: [1.1, .16, 1.22], color: 'dark' },
  { at: [-.53, 1.05, 0], size: [.18, .85, 1.25], color: 'dark' },
  { at: [-.575, .75, -.85], size: [1.65, .35, .15], color: 'steel' },
  { at: [-.1, .75, .85], size: [2.6, .35, .15], color: 'steel' },
];
