import { Component, useEffect, useMemo, useRef, Suspense, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, LoopRepeat, SkinnedMesh, Vector3, type Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { createClubDanceClips } from './WorldGuideDance';
import { createClubGuestAppearance } from './WorldClubGuestAppearance';
import { advanceClubGuestClock, clubGuestAnimationInterval, clubGuestPlan, createClubGuestClock, createClubGuestGreeting } from './WorldClubDancePlan';
import { useWorldStore } from './store';

export interface WorldClubDancerProps {
  /** Feet origin on the platform; the parent owns placement and NPC count (at most two). */
  position: [number, number, number];
  facing: number;
  step: 0 | 1;
  /** Continuous real audio beat count, not seconds or a free-running visual clock. */
  beat: () => number;
  playing: () => boolean;
}

const MAX_DISTANCE_SQ = 48 * 48;
const guestInspectors = new Map<number, () => unknown>();
export const readClubGuestPoses = () => [...guestInspectors.values()].map(read => read());

class ClubDancerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[club-dancer] ambient character unavailable', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function ClubDancerModel({ position, facing, step, beat, playing }: WorldClubDancerProps) {
  const gltf = useLoader(GLTFLoader, '/assets/world/guide/G24.glb', withWorldAssetDecoder) as GLTF;
  const group = useRef<Group>(null);
  const rig = useMemo(() => {
    const scene = clone(gltf.scene);
    const skeletons = new Set<SkinnedMesh['skeleton']>();
    scene.traverse(o => {
      if (o instanceof SkinnedMesh) skeletons.add(o.skeleton);
    });
    let appearance: ReturnType<typeof createClubGuestAppearance> | undefined;
    let mixer: AnimationMixer | undefined;
    try {
      const idleClip = gltf.animations.find(c => c.name === 'Idle');
      if (!idleClip) throw new Error('Club dancer requires G24 Idle');
      appearance = createClubGuestAppearance(scene, step);
      // Calibration reads the guest's actual trainers, never invisible player boots.
      const danceClips = createClubDanceClips(scene);
      const greetingClip = createClubGuestGreeting(scene);
      mixer = new AnimationMixer(scene);
      const idle = mixer.clipAction(idleClip).setLoop(LoopRepeat, Infinity);
      const dances = danceClips.map(c => mixer!.clipAction(c).setLoop(LoopRepeat, Infinity));
      const greeting = mixer.clipAction(greetingClip).setLoop(LoopRepeat, Infinity);
      for (const action of [idle, ...dances]) {
        action.paused = true; action.setEffectiveWeight(action === idle ? 1 : 0); action.play();
      }
      greeting.paused = true; greeting.setEffectiveWeight(0); greeting.play();
      mixer.update(0);
      scene.scale.setScalar(appearance.scale);
      return { scene, mixer, idle, dances, greeting, appearance, skeletons,
        camera: new Vector3(), origin: new Vector3() };
    } catch (error) {
      // A failed bake never reaches effect cleanup; release any already-owned resources here.
      mixer?.stopAllAction(); mixer?.uncacheRoot(scene);
      appearance?.dispose(); skeletons.forEach(skeleton => skeleton.dispose());
      throw error;
    }
  }, [gltf, step]);
  const clock = useRef({ pending: 0, idle: 0, danceWeights: [0, 0], first: true,
    audio: createClubGuestClock(), greetingTime: 1.9, lastGreetingPhrase: -1 });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const read = () => ({ guest: step, visible: group.current?.visible, playing: playing(),
      beat: beat(), idleWeight: rig.idle.getEffectiveWeight(),
      dances: rig.dances.map(a => ({ name: a.getClip().name, time: a.time, weight: a.getEffectiveWeight(), enabled: a.enabled })),
      feet: rig.appearance.mesh.skeleton.bones.filter(b => /^foot[._]?[LR]$/.test(b.name)).map(b => ({ name: b.name, position: b.getWorldPosition(new Vector3()).toArray() })) });
    guestInspectors.set(step, read);
    return () => { if (guestInspectors.get(step) === read) guestInspectors.delete(step); };
  }, [rig, step, beat, playing]);

  useEffect(() => {
    // Development effect replay may have detached/disposed this private mesh. Its CPU
    // attributes remain valid; Three re-uploads GPU buffers, and the mixer rebinds actions.
    if (!rig.appearance.mesh.parent) rig.scene.add(rig.appearance.mesh);
    for (const action of [rig.idle, ...rig.dances, rig.greeting]) action.play();
    return () => {
      rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene);
      rig.appearance.dispose();
      // SkeletonUtils creates private Skeletons; shared loader geometry/materials stay cached.
      rig.skeletons.forEach(skeleton => skeleton.dispose());
    };
  }, [rig]);

  useFrame(({ camera }, delta) => {
    const root = group.current;
    if (!root) return;
    const state = useWorldStore.getState();
    if (state.paused || state.poolInspect || state.shot || (typeof document !== 'undefined' && document.hidden)) {
      clock.current.pending = 0;
      return;
    }
    camera.getWorldPosition(rig.camera); root.getWorldPosition(rig.origin);
    const distanceSq = rig.camera.distanceToSquared(rig.origin);
    root.visible = distanceSq <= MAX_DISTANCE_SQ;
    if (!root.visible) { clock.current.pending = 0; return; }
    const time = clock.current;
    time.pending += Math.min(Math.max(0, delta), .1);
    const interval = clubGuestAnimationInterval(distanceSq, false);
    if (interval === null) { time.pending = 0; return; }
    if (!time.first && time.pending < interval) return;
    const dt = time.pending; time.pending = 0; time.first = false;
    const audioBeat = beat(), isPlaying = playing() && Number.isFinite(audioBeat);
    const plan = clubGuestPlan(audioBeat, step);
    const times = isPlaying ? advanceClubGuestClock(time.audio, audioBeat, dt, rig.dances.map(a => a.getClip().duration)) : time.audio.times;
    if (!isPlaying) time.audio.lastBeat = null;
    for (let i = 0; i < time.danceWeights.length; i++) {
      const target = isPlaying && i === plan.move ? 1 : 0;
      time.danceWeights[i] += (target - time.danceWeights[i]) * (1 - Math.exp(-dt / .26));
      if (Math.abs(time.danceWeights[i] - target) < .001) time.danceWeights[i] = target;
    }
    time.idle = (time.idle + dt) % rig.idle.getClip().duration;
    rig.idle.time = time.idle;
    rig.idle.setEffectiveWeight(Math.max(0, 1 - time.danceWeights[0] - time.danceWeights[1]));
    for (let i = 0; i < rig.dances.length; i++) {
      const action = rig.dances[i];
      action.setEffectiveWeight(time.danceWeights[i]);
      if (isPlaying) action.time = times[i];
    }
    if (isPlaying && plan.greet && time.lastGreetingPhrase !== plan.phrase) {
      time.greetingTime = 0; time.lastGreetingPhrase = plan.phrase;
    }
    time.greetingTime = Math.min(1.9, time.greetingTime + dt);
    rig.greeting.time = Math.min(1.8999, time.greetingTime);
    rig.greeting.setEffectiveWeight(time.greetingTime < 1.9 ? .8 : 0);
    // Beat-derived bounded cursors prevent a source/deck change from teleporting the pose.
    rig.mixer.update(0);
  });

  return <group ref={group} position={position} rotation={[0, facing, 0]} name={`club-dancer-${step}`} dispose={null}>
    <primitive object={rig.scene} dispose={null} />
  </group>;
}

/** Ambient character only: no player controller, physics body, QA recorder or mining sockets. */
export function WorldClubDancer(props: WorldClubDancerProps) {
  return <ClubDancerBoundary><Suspense fallback={null}><ClubDancerModel {...props} /></Suspense></ClubDancerBoundary>;
}

export default WorldClubDancer;
