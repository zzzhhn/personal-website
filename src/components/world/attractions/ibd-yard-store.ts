import { create } from 'zustand';
import { useWorldStore } from '../store';
import { ibdLocal } from './ibd-yard-layout.ts';
import { createIbdYardGame, requestIbdYardAction, finishIbdYardAction, cancelIbdYardAction, type IbdAction, type IbdActor } from './ibd-yard-game.ts';
import type { IbdMotionWait } from './ibd-yard-safety.ts';

/** One scene/HUD bridge, no global timer or browser storage. Retains this visit across a lazy remount. */
export const useIbdYardStore = create(() => ({ game: createIbdYardGame(), active: false, guideEnabled: true, motionWait: null as IbdMotionWait }));
export function setIbdMotionWait(motionWait: IbdMotionWait) {
  if (useIbdYardStore.getState().motionWait !== motionWait) useIbdYardStore.setState({ motionWait });
}
/** Guidance is an independent visit preference: skipping/resuming never changes cargo or evidence. */
export function setIbdGuide(enabled: boolean) { useIbdYardStore.setState({ guideEnabled: enabled }); }
export function ibdActor(): IbdActor {
  const world = useWorldStore.getState();
  return { local: ibdLocal(world.position), active: useIbdYardStore.getState().active,
    paused: world.paused || !!world.card || world.poolInspect || !!world.shot,
    hidden: typeof document !== 'undefined' && document.hidden,
    driving: !!world.activeVehicle || !!world.seat || !!world.clubMode };
}
export function dispatchIbdAction(action: IbdAction) {
  useIbdYardStore.setState(s => {
    const game = requestIbdYardAction(s.game, action, ibdActor());
    return { game, motionWait: game.pending === s.game.pending ? s.motionWait : null };
  });
}
export function finishIbdAction(token: number) {
  useIbdYardStore.setState(s => ({ game: finishIbdYardAction(s.game, token, ibdActor()), motionWait: null }));
}
export function cancelIbdAction() {
  useIbdYardStore.setState(s => ({ game: cancelIbdYardAction(s.game), motionWait: null }));
}
