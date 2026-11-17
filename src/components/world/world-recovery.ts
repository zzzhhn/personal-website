import type { RigidBody } from '@dimforge/rapier3d-compat';
import { resetActorBody, stopActorBody } from './actor-physics.ts';
import type { ActorHome } from './actor-sites';
import { useWorldStore } from './store.ts';
import { actorActivities } from './actor-activities';

/** Called by the store subscription, not a paused physics/frame callback. */
export function recoverActor(home: ActorHome, player: RigidBody | null, driven: RigidBody | undefined,
  clearTransient: () => void, resetCamera: () => void) {
  if (!player) return false;
  actorActivities.interrupt('recovery'); // Each region preserves its owned items before the relocation.
  if (driven) stopActorBody(driven);
  clearTransient();
  player.setEnabled(true); resetActorBody(player, home.position);
  actorActivities.sync({ position: [...home.position], grounded: false, available: false });
  resetCamera();
  useWorldStore.setState({ activeVehicle: null, nearbyVehicle: null, nearbyInteract: null, interactPick: null,
    seat: null, card: null, poolInspect: false, canVault:false, canRecover: false, speed: 0, position: [...home.position], zone: home.zone,
    paused: false, shot: null, zoom: 1, toast: { ...home.notice, at: performance.now() } });
  return true;
}
