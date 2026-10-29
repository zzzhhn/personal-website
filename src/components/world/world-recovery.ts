import type { RigidBody } from '@dimforge/rapier3d-compat';
import { resetActorBody, stopActorBody } from './actor-physics.ts';
import { CAMP_SPAWN } from './layout.ts';
import { useWorldStore } from './store.ts';
import { cancelMineAction, mineActor, mineVisualSockets } from './alpha-mine-state.ts';

/** Called by the store subscription, not a paused physics/frame callback. */
export function returnPlayerToCamp(player: RigidBody | null, driven: RigidBody | undefined,
  clearTransient: () => void, resetCamera: () => void) {
  if (!player) return false;
  cancelMineAction(); // A stone already in flight returns to the hand, never disappears.
  if (driven) stopActorBody(driven);
  clearTransient();
  player.setEnabled(true); resetActorBody(player, CAMP_SPAWN);
  Object.assign(mineActor, { position: [...CAMP_SPAWN], moving: false, grounded: false, available: false, restTarget: null });
  Object.assign(mineVisualSockets, { valid: false, sampledActionKind: null, sampledElapsed: 0 });
  resetCamera();
  useWorldStore.setState({ activeVehicle: null, nearbyVehicle: null, nearbyInteract: null, interactPick: null,
    seat: null, card: null, clubMode: null, poolInspect: false, canVault:false, canRecover: false, speed: 0, position: [...CAMP_SPAWN], zone: 'camp',
    paused: false, shot: null, zoom: 1, toast: { en: 'Back at camp. Your ore and research are kept.', zh: '已回到营地，矿石与研究进度已保留。', at: performance.now() } });
  return true;
}
