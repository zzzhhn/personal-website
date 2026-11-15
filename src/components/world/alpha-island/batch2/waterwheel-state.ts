/** Independent sluices: 0 closed, 1 half, 2 open. Only interaction commits notify
 * subscribers; continuous wheel / water / flower motion stays outside React. */
export type SluiceOpening = 0 | 1 | 2;
export type WaterwheelGates = readonly [SluiceOpening, SluiceOpening, SluiceOpening];
export type WaterwheelMode = 'still' | 'low' | 'balanced' | 'spill';
export interface WaterwheelFlow {
  mode: WaterwheelMode;
  amount: number;
  radiansPerSecond: number;
  bucketFill: number;
  irrigating: boolean;
  passageRevealed: boolean;
}
export function waterwheelFlow(gates: WaterwheelGates): WaterwheelFlow {
  const total = gates[0] + gates[1] + gates[2];
  const mode: WaterwheelMode = total === 0 ? 'still' : total === 1 ? 'low' : total <= 4 ? 'balanced' : 'spill';
  return { mode, amount: total / 6, radiansPerSecond: mode === 'spill' ? 2.25 : mode === 'balanced' ? .62 : mode === 'low' ? .18 : 0,
    bucketFill: mode === 'balanced' ? .88 : mode === 'spill' ? .18 : mode === 'low' ? .22 : 0,
    irrigating: mode === 'balanced', passageRevealed: mode === 'balanced' || mode === 'still' };
}
export interface WaterwheelSnapshot {
  gates: WaterwheelGates;
  flow: WaterwheelFlow;
  everBalanced: boolean;
  revision: number;
}
const initialGates: WaterwheelGates = [2, 2, 2];
let snapshot: WaterwheelSnapshot = { gates: initialGates, flow: waterwheelFlow(initialGates), everBalanced: false, revision: 0 };
const listeners = new Set<() => void>();
export const getWaterwheelSnapshot = () => snapshot;
export function subscribeWaterwheel(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function cycleWaterwheelGate(index: 0 | 1 | 2) {
  const gates = [...snapshot.gates] as [SluiceOpening, SluiceOpening, SluiceOpening];
  gates[index] = ((gates[index] + 1) % 3) as SluiceOpening;
  const flow = waterwheelFlow(gates);
  snapshot = { gates, flow, everBalanced: snapshot.everBalanced || flow.irrigating, revision: snapshot.revision + 1 };
  listeners.forEach(listener => listener());
  return snapshot;
}
/** Island-local corridor contract, surface datums. Terrain must remain <=24.
 * North and south bypasses stay independent of all sluice states. */
export const WATERWHEEL_PASSAGE = {
  west: [-29.8, 24.04, 4.5] as const, east: [-21.8, 24.04, 4.5] as const,
  bounds: { minX: -29.8, maxX: -21.8, minZ: 3.6, maxZ: 6.2, floorY: 24.04, ceilingY: 28.9 },
} as const;
