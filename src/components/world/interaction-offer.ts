import type { Interactable } from './WorldInteract';
import type { PickupApproach } from './pickup-approach';
import type { Vec3 } from './types';

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
