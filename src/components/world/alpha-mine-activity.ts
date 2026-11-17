import { actorActivities, type ActorActivities } from './actor-activities';
import { advanceMineAction, cancelMineAction, mineActor, mineBusy, mineVisualSockets,
  putDownMineOre, useAlphaMineStore } from './alpha-mine-state';

/** The mine owns its actor mirror, input semantics, action clock and carried-ore policy. */
export function registerMineActivity(registry: ActorActivities = actorActivities) {
  const interrupt = () => {
    cancelMineAction();
    Object.assign(mineActor, { moving: false, restTarget: null });
    Object.assign(mineVisualSockets, { valid: false, sampledActionKind: null, sampledElapsed: 0 });
  };
  return registry.register({
    id: 'alpha-mine',
    read() {
      const state = useAlphaMineStore.getState();
      return { busy: mineBusy(), carrying: !!state.carried, facing: state.action?.target,
        allowsInteraction: id => !state.carried || id.startsWith('alpha-mine-'),
        notice: reason => reason === 'vehicle'
          ? { zh: '先按 F 放下矿石，再上车。', en: 'Press F to put the ore down before entering.' }
          : { zh: '先在矿场暂存台按 F 放下矿石，再使用其他设施。', en: 'Set the ore on a mine shelf with F before using another attraction.' },
      };
    },
    sync(pose) { Object.assign(mineActor, pose); },
    input(moving) {
      mineActor.moving = moving;
      const action = useAlphaMineStore.getState().action;
      if (moving && action && !action.contact) cancelMineAction();
    },
    advance: advanceMineAction,
    command: () => putDownMineOre(),
    interrupt,
    dispose() {
      interrupt();
      mineActor.available = false;
    },
  });
}
