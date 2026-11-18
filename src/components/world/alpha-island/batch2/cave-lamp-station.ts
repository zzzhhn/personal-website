import { interactionActor } from '../../actor-activities';
import { PICKUP_DISCOVERY_RADIUS } from '../../pickup-approach';
import { guideActionHand, releaseGuideActionHand } from '../../rides/guide-action-hand';
import { useWorldStore } from '../../store';
import type { Vec3 } from '../../types';
import type { Interactable } from '../../WorldInteract';
import { alphaWorld } from '../alpha-layout';
import { cancelAlphaHand } from '../alpha-state';
import { alphaActorCanAct } from '../alpha-station-interaction';
import { caveLampApproach, caveLampInteraction, CAVE_LAMP_LABELS } from './batch2-station-feedback';
import { CAVE_LAMP_HOME, startCaveLamp, type CaveState } from './cave-state';

export const CAVE_HAND_OWNER = 'alpha-echo-cave';
const hook = alphaWorld([CAVE_LAMP_HOME[0] + .32, CAVE_LAMP_HOME[1] + 1.48, CAVE_LAMP_HOME[2]]);
const approach = caveLampApproach(hook);

export function caveLampStation(state: CaveState, setGrip: (grip: Vec3) => void, cancel: () => void): Interactable {
  const action = () => caveLampInteraction(state.lamp, guideActionHand.owner === CAVE_HAND_OWNER);
  const enabled = () => {
    const p = interactionActor.position;
    return alphaActorCanAct() && !!action() && Math.hypot(p[0] - hook[0], p[2] - hook[2]) <= PICKUP_DISCOVERY_RADIUS
      && Math.abs(p[1] - hook[1]) <= 2.5;
  };
  return {
    id: 'alpha-cave-miner-lamp', position: hook, radius: PICKUP_DISCOVERY_RADIUS, kind: 'exhibit',
    get label() { return CAVE_LAMP_LABELS[action() === 'return' ? 'return' : 'take']; },
    get approach() { return state.lamp === 'rack' ? approach : undefined; },
    enabled,
    onInteract() {
      if (!enabled()) return;
      if (action() === 'return') {
        cancel();
        useWorldStore.setState({toast: {zh:'矿灯已挂回。', en:'The miner lamp is back on its hook.', at:performance.now()}});
      } else if (interactionActor.grounded && approach.ready(interactionActor.position)) {
        cancelAlphaHand();
        releaseGuideActionHand();
        if (!startCaveLamp(state, interactionActor.position)) return;
        const grip: Vec3 = [...hook];
        setGrip(grip);
        Object.assign(guideActionHand, {owner:CAVE_HAND_OWNER, target:grip, facing:grip, mode:'grip', cancel});
      }
    },
  };
}
