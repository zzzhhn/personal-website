/** Independent sluices: 0 closed, 1 half, 2 open. Only gate commits and the one irrigation-complete boundary notify
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
export function waterwheelFlow(gates: WaterwheelGates, watered = false): WaterwheelFlow {
  const total = gates[0] + gates[1] + gates[2];
  const mode: WaterwheelMode = total === 0 ? 'still' : total === 1 ? 'low' : total <= 4 ? 'balanced' : 'spill';
  return { mode, amount: total / 6, radiansPerSecond: mode === 'spill' ? 2.25 : mode === 'balanced' ? .62 : mode === 'low' ? .18 : 0,
    bucketFill: mode === 'balanced' ? .88 : mode === 'spill' ? .18 : mode === 'low' ? .22 : 0,
    irrigating: mode === 'balanced', passageRevealed: watered || mode === 'still' };
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
  const flow = waterwheelFlow(gates, snapshot.everBalanced);
  snapshot = { gates, flow, everBalanced: snapshot.everBalanced, revision: snapshot.revision + 1 };
  listeners.forEach(listener => listener());
  return snapshot;
}
/** Compatibility name: this records completed watering, never a brief gate setting. */
export function completeWaterwheelIrrigation() {
  if (snapshot.everBalanced) return false;
  snapshot = { ...snapshot, everBalanced: true, flow: waterwheelFlow(snapshot.gates, true), revision: snapshot.revision + 1 };
  listeners.forEach(listener => listener());
  return true;
}

export type WaterwheelIrrigation = { liftedSeconds: number; water: number; bloom: number; reveal: number; complete: boolean };
export const createWaterwheelIrrigation = (complete = false): WaterwheelIrrigation => ({
  liftedSeconds: complete ? .95 : 0, water: complete ? 1 : 0, bloom: complete ? 1 : 0, reveal: complete ? 1 : 0, complete,
});
/** Ref-owned continuous progress. Actual bucket fill and eased rotor speed must
 * settle before two or three buckets can deliver water. Brief balanced settings
 * cannot bank partial watering across dry/fast flow; completed flowers stay grown.
 * About three visible seconds follow settling, without a hidden exact gate code. */
export function stepWaterwheelIrrigation(state: WaterwheelIrrigation, flow: WaterwheelFlow,
  bucketFill: number, speed: number, delta: number, active = true) {
  if (!active || state.complete || !Number.isFinite(delta) || delta <= 0) return false;
  const dt = Math.min(delta, .06);
  if (flow.mode !== 'balanced') {
    state.liftedSeconds = state.water = state.bloom = state.reveal = 0;
    return false;
  }
  if (bucketFill < .72 || speed < .3 || speed > .9) {
    state.liftedSeconds = 0;
    return false;
  }
  if (state.liftedSeconds < .95) state.liftedSeconds = Math.min(.95, state.liftedSeconds + dt);
  else if (state.water < 1) state.water = Math.min(1, state.water + dt / .55);
  else if (state.bloom < 1) state.bloom = Math.min(1, state.bloom + dt / .85);
  else state.reveal = Math.min(1, state.reveal + dt / .6);
  if (state.reveal < 1) return false;
  state.complete = true;
  return true;
}
/** Island-local corridor contract, surface datums. Terrain must remain <=24.
 * North and south bypasses stay independent of all sluice states. */
export const WATERWHEEL_PASSAGE = {
  west: [-29.8, 24.03, 4.5] as const, east: [-21.8, 24.03, 4.5] as const,
  bounds: { minX: -29.8, maxX: -21.8, minZ: 3.6, maxZ: 6.2, floorY: 24.03, ceilingY: 28.9 },
} as const;
