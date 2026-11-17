import { actorActivities, type ActorActivities, type ActorActivity } from './actor-activities';
import { useWorldStore } from './store';
import { CLUB } from './djc-club-layout';
import { clubAudio } from './WorldClubAudio';

type Audio = Pick<typeof clubAudio, 'enable' | 'energy' | 'beat'>;
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

/** Club owns its controls and audio gesture; the actor only forwards generic activity events. */
export function registerClubActivity(registry: ActorActivities = actorActivities, audio: Audio = clubAudio) {
  const leave = () => {
    if (!useWorldStore.getState().clubMode) return false;
    useWorldStore.setState({clubMode: null});
    return true;
  };
  const activity: ActorActivity = {
    id: 'club',
    read() {
      const mode = useWorldStore.getState().clubMode;
      return {busy: mode === 'dj', carrying: false, occupied: !!mode,
        inputOwner: mode === 'dj' ? 'decks' : undefined, inputContext: mode ?? undefined,
        blocksOffers: !!mode, facing: mode === 'dj' ? [...CLUB.console] : undefined};
    },
    sync(pose, {occupiedElsewhere}) {
      if (pose.available === false || occupiedElsewhere) leave();
    },
    input(moving, jumping) {
      if (useWorldStore.getState().clubMode === 'dance' && (moving || jumping)) leave();
    },
    keyboard(key) {
      const state = useWorldStore.getState();
      if (state.clubMode && key.code === 'KeyE') {
        if (!key.repeat) leave();
        return 'handled';
      }
      if (state.clubMode === 'dj') return 'blocked';
      if (state.clubMode === 'dance') {
        if (key.code === 'Digit1' || key.code === 'Digit2') {
          useWorldStore.setState({danceStep: key.code === 'Digit1' ? 0 : 1});
          return 'handled';
        }
        if (movementKeys.has(key.code)) leave();
      } else if (key.code === 'KeyE' && !key.repeat
        && ['djc-club-dance', 'djc-club-decks'].includes(state.nearbyInteract?.id ?? '')) {
        // Must run synchronously in the DOM key event, before the physics-frame interaction.
        void audio.enable();
      }
    },
    interact: leave,
    animation() {
      const state = useWorldStore.getState();
      return state.clubMode === 'dance'
        ? {dance: audio.energy() > 0 ? state.danceStep : null, danceBeat: audio.beat()} : null;
    },
    advance() {}, command() { return false; },
    interrupt: leave, dispose: () => { leave(); },
  };
  return registry.register(activity);
}
