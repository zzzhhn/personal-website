import { interactionActor } from '../actor-activities';
import { PICKUP_DISCOVERY_RADIUS } from '../pickup-approach';
import { useWorldStore } from '../store';
import type { Interactable } from '../WorldInteract';
import { alphaActionLabel, alphaActionTarget, alphaPickupApproach } from './alpha-action-reach';
import { alphaWorld } from './alpha-layout';
import { startAlphaHand, useAlphaStore, type AlphaAction } from './alpha-state';
import { ALPHA_PERSONAL_CAIRN_CAP } from './alpha-personal-cairn';

export function alphaActorCanAct() {
  const w = useWorldStore.getState();
  return interactionActor.available && !w.paused && !w.shot && !w.card && !w.seat
    && !w.activeVehicle && !w.poolInspect && (typeof document === 'undefined' || !document.hidden);
}

export function alphaStationInteraction(kind: AlphaAction, wind: number, primeAudio: () => void, stones = 0): Interactable {
  const target = alphaWorld(alphaActionTarget(kind, wind, stones));
  const approach = kind === 'wind' || kind === 'stone' || kind === 'lantern' ? alphaPickupApproach(kind, wind, stones) : undefined;
  const enabled = () => {
    const s = useAlphaStore.getState();
    return alphaActorCanAct() && interactionActor.grounded && !s.action && !s.carried
      && (kind !== 'wind' || wind === s.wind) && (kind !== 'stone' || (stones===s.stones&&s.stones<ALPHA_PERSONAL_CAIRN_CAP));
  };
  return {
    id: `alpha-${kind}`, position: target, radius: approach ? PICKUP_DISCOVERY_RADIUS : kind === 'sand' ? 1.6 : 1.3,
    kind: 'exhibit', label: alphaActionLabel(kind, wind), approach, enabled,
    onInteract() {
      if (!enabled() || (approach && !approach.ready(interactionActor.position))) return;
      primeAudio();
      // Carried lanterns and placing stones animate their hand target after acceptance.
      startAlphaHand(kind, [...target], interactionActor.position);
    },
  };
}
