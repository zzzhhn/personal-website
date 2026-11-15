import type { ShallowsState } from './shallows-state';
import type { CaveState } from './cave-state';
import { PLAYER_HALF_HEIGHT,PLAYER_RADIUS } from '../../actor-physics';

type Notice = { zh: string; en: string };
export const createShallowsArrivalReceipts = () => ({ resets: -1, stones: new Set<number>(), bridge: false });
/** Session-only acknowledgements of actual final body poses, never button presses
 * or planned motion. A successful mechanism reset starts a fresh set of receipts. */
export function takeShallowsArrival(receipts: ReturnType<typeof createShallowsArrivalReceipts>, state: ShallowsState, index: number, poseError: number) {
  if (receipts.resets !== state.resets) {
    receipts.resets = state.resets; receipts.stones.clear(); receipts.bridge = false;
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.progress.length || state.progress[index] !== 1
    || !Number.isFinite(poseError) || poseError < 0 || poseError > .01 || receipts.stones.has(index)) return null;
  receipts.stones.add(index);
  const bridge = !receipts.bridge && receipts.stones.size === state.progress.length && state.progress.every(p => p === 1);
  if (bridge) receipts.bridge = true;
  return { index, bridge };
}
export const SHALLOWS_SLOT_NOTICE: Notice = { zh: '符文石已入槽。', en: 'The rune stone is in place.' };
export const SHALLOWS_BRIDGE_NOTICE: Notice = {
  zh: '石桥接通了。过桥后沿山路去语法树。',
  en: 'The bridge is complete. Cross it and follow the mountain path to the Grammar Tree.',
};

// Distinct immutable snapshots let WorldActors compare the previous HUD label
// with a fresh live label without accidentally mutating both sides of the comparison.
export const CAVE_LAMP_LABELS = {
  take: Object.freeze({ zh: '从挂钩取矿灯', en: 'Take the miner lamp' }),
  approach: Object.freeze({ zh: '靠近矿灯一侧', en: 'Move closer on the lamp side' }),
  return: Object.freeze({ zh: '把矿灯挂回原挂钩', en: 'Hang the miner lamp back' }),
};
/** The rack projects +X. Only its front standing strip is both capsule-clear and
 * reachable by the measured G24 palm. The wider 1.35 m prompt is guidance only. */
export function caveLampPickupReach(position: readonly number[], hook: readonly number[], grounded: boolean) {
  const dx=position[0]-hook[0],dz=position[2]-hook[2];
  const gripHeight=hook[1]-(position[1]-PLAYER_HALF_HEIGHT-PLAYER_RADIUS);
  return grounded&&dx>=.43-1e-6&&Math.abs(dz)<=.25&&Math.hypot(dx,dz)<=.6&&gripHeight>=.9&&gripHeight<=1.4;
}
export const caveLampInteraction = (lamp: CaveState['lamp'], ownsHand: boolean, canReach = true) =>
  lamp === 'rack' ? canReach ? 'take' : 'approach' : lamp === 'carried' && ownsHand ? 'return' : null;
export function caveLampPickupNotice(before: CaveState['lamp'], after: CaveState['lamp']): Notice | null {
  return before === 'reaching' && after === 'carried' ? {
    zh: '矿灯拿稳了。敲铜管听回声，回到挂钩旁按 E 挂回。',
    en: 'Lamp secured. Strike a chime to follow its echo; press E beside the hook to hang it back.',
  } : null;
}
