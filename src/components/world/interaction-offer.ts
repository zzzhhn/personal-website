import type { Interactable } from './WorldInteract';
import { pickupApproachMotion, PICKUP_APPROACH_TIMEOUT, type PickupApproach } from './pickup-approach';
import { angleDelta } from './actor-physics';
import type { Vec3 } from './types';
import type * as Rapier from '@dimforge/rapier3d-compat';

/** Only advertise an anchor with an unobstructed sight line from the actor's upper body. */
export function interactionVisible(world: Rapier.World, rapier: Pick<typeof Rapier, 'Ray'>, player: Rapier.RigidBody | undefined,
  from: { x: number; y: number; z: number }, target: Vec3) {
  const origin = { x: from.x, y: from.y + .45, z: from.z };
  const dx = target[0]-origin.x, dy = target[1]+.2-origin.y, dz = target[2]-origin.z, len = Math.hypot(dx,dy,dz);
  if (len < .35) return true;
  return !world.castRay(new rapier.Ray(origin,{ x: dx/len, y: dy/len, z: dz/len }), len-.3, true,
    undefined,undefined,undefined,player,c => {
      const data = c.parent()?.userData as { interactable?: string; vehicle?: string } | undefined;
      return !c.isSensor() && !data?.interactable && !data?.vehicle;
    });
}

export type InteractionOffer = { item: Interactable; stand: Vec3 | null };
export interface InteractionOfferContext {
  position: Vec3;
  /** Monotonic seconds, supplied by the controller. */
  now: number;
  available: (item: Interactable) => boolean;
  visible: (item: Interactable) => boolean;
  findStand: (approach: PickupApproach) => Vec3 | null;
}

const samePoint = (a: Vec3, b: Vec3, tolerance = .001) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tolerance;

/** The prompt and activation use the same eligibility query. Only the expensive stance search
 * is briefly cached; enabled state, actor ownership and visibility are always live. Activation
 * forces a fresh search because another body may have moved since the prompt was drawn. */
export function createInteractionOfferResolver() {
  let cache = new WeakMap<Interactable, {
    from: Vec3; target: Vec3; at: number; stand: Vec3 | null;
  }>();
  return {
    clear() { cache = new WeakMap(); },
    resolve(item: Interactable, context: InteractionOfferContext, activate = false): InteractionOffer | null {
      const from = context.position, point = item.position;
      if (!from.every(Number.isFinite) || !point.every(Number.isFinite)
        || !context.available(item) || (item.enabled && !item.enabled())
        || Math.abs(point[1] - from[1]) > 2.5
        || Math.hypot(point[0] - from[0], point[2] - from[2]) > (item.radius ?? 2.2)
        || !context.visible(item)) return null;
      const approach = item.approach;
      if (!approach) return { item, stand: null };
      const target = approach.target();
      if (!target.every(Number.isFinite)) return null;
      const previous = cache.get(item);
      // Several adapters expose live getters that allocate a new descriptor on every read.
      // Cache geometry, not callback identity; recheck the current adapter's stance predicate.
      const reusable = !activate && previous
        && context.now >= previous.at && context.now - previous.at < .12
        && samePoint(previous.from, from, .06) && samePoint(previous.target, target)
        && (!previous.stand || approach.ready(previous.stand));
      let stand: Vec3 | null;
      if (reusable) stand = previous.stand;
      else {
        stand = context.findStand(approach);
        // Invalid adapters cannot turn the E prompt into an unfulfillable request.
        if (stand && (!stand.every(Number.isFinite) || !approach.ready(stand))) stand = null;
        cache.set(item, { from: [...from], target: [...target], at: context.now, stand: stand && [...stand] });
      }
      if (!stand || !approach.ready(stand)) return null;
      return { item, stand: [...stand] };
    },
  };
}

/** Own the interval between selecting a reachable item and invoking its action. */
export function createInteractionApproach() {
  let pending: { item: Interactable; stand: Vec3; elapsed: number; stillSelected?: () => boolean } | null = null;
  let heldHeading: number | null = null;
  function cancel() {
    pending = null;
    heldHeading = null;
  }
  return {
    get active() { return pending !== null; },
    cancel,
    /** E owns the direction already held at acceptance, through the hand animation.
     * Neutral rearms walking; a new heading can interrupt immediately. */
    consumeHeldMovement(x: number, z: number) {
      if (!pending && heldHeading === null) return false;
      if (Math.hypot(x, z) <= .05) {
        heldHeading = null;
        return false;
      }
      if (heldHeading !== null && Math.abs(angleDelta(heldHeading, Math.atan2(z, x))) < Math.PI / 8) return true;
      cancel();
      return false;
    },
    request(item: Interactable, resolve: () => InteractionOffer | null, stillSelected?: () => boolean, movement?: [number, number]) {
      if (pending?.item === item && pending.stillSelected?.() !== false) return true;
      const offer = resolve();
      if (!offer) return false;
      pending = offer.stand ? { item, stand: offer.stand, elapsed: 0, stillSelected } : null;
      heldHeading = pending && movement && Math.hypot(...movement) > .05 ? Math.atan2(movement[1], movement[0]) : null;
      if (!pending) item.onInteract();
      return true;
    },
    step(dt: number, position: Vec3, yaw: number, speed: number, grounded: boolean,
      routeClear: (item: Interactable, stand: Vec3, ready: boolean) => boolean) {
      if (!pending) return null;
      const { item, stand } = pending, approach = item.approach;
      if (!approach || !grounded || pending.stillSelected?.() === false || item.enabled?.() === false) { cancel(); return null; }
      pending.elapsed += dt;
      const ready = approach.ready(position);
      if (pending.elapsed > PICKUP_APPROACH_TIMEOUT || !routeClear(item, stand, ready)) {
        cancel();
        return { blocked: true as const };
      }
      const motion = pickupApproachMotion(position, stand, approach.target(), ready);
      const heading = yaw + Math.max(-dt * 10, Math.min(dt * 10, angleDelta(yaw, motion.yaw)));
      const arrived = ready && Math.abs(angleDelta(heading, motion.yaw)) < .12 && speed < .18;
      if (arrived) pending = null;
      return { blocked: false as const, vx: motion.vx, vz: motion.vz, heading, arrived: arrived ? item : null };
    },
  };
}
