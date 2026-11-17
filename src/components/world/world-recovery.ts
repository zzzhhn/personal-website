import type { RigidBody } from '@dimforge/rapier3d-compat';
import { resetActorBody, stopActorBody } from './actor-physics.ts';
import { CAMP_SPAWN } from './layout.ts';
import { useWorldStore } from './store.ts';
import { actorActivities } from './actor-activities';

/** Called by the store subscription, not a paused physics/frame callback. */
export function returnPlayerToCamp(player: RigidBody | null, driven: RigidBody | undefined,
  clearTransient: () => void, resetCamera: () => void) {
  if (!player) return false;
  actorActivities.interrupt(); // Each region preserves its owned items before the relocation.
  if (driven) stopActorBody(driven);
  clearTransient();
  player.setEnabled(true); resetActorBody(player, CAMP_SPAWN);
  actorActivities.sync({ position: [...CAMP_SPAWN], grounded: false, available: false });
  resetCamera();
  useWorldStore.setState({ activeVehicle: null, nearbyVehicle: null, nearbyInteract: null, interactPick: null,
    seat: null, card: null, clubMode: null, poolInspect: false, canVault:false, canRecover: false, speed: 0, position: [...CAMP_SPAWN], zone: 'camp',
    paused: false, shot: null, zoom: 1, toast: { en: 'Back at camp. Your ore and research are kept.', zh: '已回到营地，矿石与研究进度已保留。', at: performance.now() } });
  return true;
}
