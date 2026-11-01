import { AdditiveAnimationBlendMode, AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, type Object3D } from 'three';
import { CLUB_DANCE_BEATS } from './WorldGuideDance';

const ORDER = [[0, 0, 1, -1, 0, 1, -1, 0], [1, -1, 0, 1, 0, -1, 1, 0]] as const;

export function clubGuestAnimationInterval(distanceSquared: number, blocked: boolean): number | null {
  if (blocked || !Number.isFinite(distanceSquared) || distanceSquared > 48 * 48) return null;
  return distanceSquared > 18 * 18 ? 1 / 15 : 0;
}

/** Fixed authored phrases, not online activity or music-structure analysis. A 128-beat
 * arrangement has distinct moves, listening breaks and one brief acknowledgement per break. */
export function clubGuestPlan(beat: number, guest: 0 | 1) {
  const b = Math.max(0, Number.isFinite(beat) ? beat : 0), phrase = Math.floor(b / 16);
  const move = ORDER[guest][phrase % ORDER[guest].length];
  return { phrase, move, greet: move < 0 && b % 16 >= (guest ? 5 : 3) && b % 16 < (guest ? 9 : 7) };
}

export interface ClubGuestClock { lastBeat: number | null; beatsPerSecond: number; times: number[] }
export const createClubGuestClock = (): ClubGuestClock => ({ lastBeat: null, beatsPerSecond: 2, times: [0, 0] });

/** Continuous local clip cursors avoid teleporting a pose when a track changes or seeks.
 * Stable audio beat deltas drive tempo; a discontinuity waits for subsequent real deltas.
 * The native-speed bound is deliberate and independent from frame rate / distance LOD. */
export function advanceClubGuestClock(clock: ClubGuestClock, beat: number, dt: number, durations: readonly number[]) {
  const difference = clock.lastBeat === null ? 0 : beat - clock.lastBeat;
  if (dt > 0 && difference > 0 && difference < .8) {
    const measured = difference / dt;
    if (measured >= .8 && measured <= 3.2) clock.beatsPerSecond += (measured - clock.beatsPerSecond) * (1 - Math.exp(-dt / .35));
  }
  clock.lastBeat = beat;
  for (let i = 0; i < 2; i++) {
    const rate = Math.max(.55, Math.min(.95, clock.beatsPerSecond * durations[i] / CLUB_DANCE_BEATS[i]));
    clock.times[i] = (clock.times[i] + Math.max(0, dt) * rate) % durations[i];
  }
  return clock.times;
}

/** Authored additive acknowledgement, explicitly not CMU mocap. Its upper-body-only
 * identity endpoints and native 1.9s duration allow it to layer over a listening idle. */
export function createClubGuestGreeting(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const bones = new Map<string, Object3D>();
  scene.traverse(o => { if ((o as any).isBone) bones.set(o.name.replace(/[._]/g, ''), o); });
  const times = [0, .25, .55, .85, 1.15, 1.55, 1.9], envelope = [0, .35, .9, .7, 1, .3, 0];
  const tracks = [['upperarmR', .45], ['forearmR', .75], ['head', -.075]].map(([name, angle]) => {
    const bone = bones.get(name as string); if (!bone) throw new Error(`Club greeting missing ${name}`);
    const axis = new Vector3(0, 0, 1).applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert());
    const values = envelope.flatMap(weight => new Quaternion().setFromAxisAngle(axis, weight * (angle as number)).toArray());
    return new QuaternionKeyframeTrack(bone.name + '.quaternion', times, values);
  });
  return new AnimationClip('ClubGuestAcknowledgement', 1.9, tracks, AdditiveAnimationBlendMode);
}
