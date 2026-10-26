import { Component, useEffect, useMemo, useRef, Suspense, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, LoopRepeat, Mesh, SkinnedMesh, Vector3, type Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { refineGuideBoots } from './WorldGuideShape';
import { createClubDanceClips } from './WorldGuideDance';
import { mergeGuideMaterials } from './WorldGuide';
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

const MAX_DISTANCE_SQ = 48 * 48, LOW_RATE_DISTANCE_SQ = 18 * 18;
/** Authored choreography mapping, not a claim about the capture's original music. */
const BEATS_PER_LOOP = [4, 2] as const;

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
      if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    let disposeBoots: (() => void) | undefined, disposeMerged: (() => void) | undefined;
    let mixer: AnimationMixer | undefined;
    try {
      const idleClip = gltf.animations.find(c => c.name === 'Idle');
      if (!idleClip) throw new Error('Club dancer requires G24 Idle');
      disposeBoots = refineGuideBoots(scene);
      // Bake before batching: calibration reads the actual refined skinned boot vertices.
      const danceClips = createClubDanceClips(scene);
      disposeMerged = mergeGuideMaterials(scene);
      mixer = new AnimationMixer(scene);
      const idle = mixer.clipAction(idleClip).setLoop(LoopRepeat, Infinity);
      const dances = danceClips.map(c => mixer!.clipAction(c).setLoop(LoopRepeat, Infinity));
      for (const action of [idle, ...dances]) {
        action.paused = true; action.setEffectiveWeight(action === idle ? 1 : 0); action.play();
      }
      mixer.update(0);
      return { scene, mixer, idle, dances, disposeBoots, disposeMerged, skeletons,
        camera: new Vector3(), origin: new Vector3() };
    } catch (error) {
      // A failed bake never reaches effect cleanup; release any already-owned resources here.
      mixer?.stopAllAction(); mixer?.uncacheRoot(scene);
      disposeMerged?.(); disposeBoots?.(); skeletons.forEach(skeleton => skeleton.dispose());
      throw error;
    }
  }, [gltf]);
  const clock = useRef({ pending: 0, idle: 0, danceWeights: [0, 0], first: true });
  // Position-derived phase offsets keep the two fixed stage characters from mirroring each other.
  const phase = ((Math.sin(position[0] * 7.31 + position[2] * 3.71) + 1) * .5) % 1;

  useEffect(() => {
    for (const action of [rig.idle, ...rig.dances]) action.play();
    return () => {
      rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene);
      rig.disposeMerged?.(); rig.disposeBoots();
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
    const interval = distanceSq > LOW_RATE_DISTANCE_SQ ? 1 / 15 : 0;
    if (!time.first && time.pending < interval) return;
    const dt = time.pending; time.pending = 0; time.first = false;
    const audioBeat = beat(), isPlaying = playing() && Number.isFinite(audioBeat);
    for (let i = 0; i < time.danceWeights.length; i++) {
      const target = isPlaying && i === step ? 1 : 0;
      time.danceWeights[i] += (target - time.danceWeights[i]) * (1 - Math.exp(-dt / .1));
      if (Math.abs(time.danceWeights[i] - target) < .001) time.danceWeights[i] = target;
    }
    time.idle = (time.idle + dt) % rig.idle.getClip().duration;
    rig.idle.time = time.idle;
    rig.idle.setEffectiveWeight(Math.max(0, 1 - time.danceWeights[0] - time.danceWeights[1]));
    for (let i = 0; i < rig.dances.length; i++) {
      const action = rig.dances[i];
      action.setEffectiveWeight(time.danceWeights[i]);
      if (isPlaying && time.danceWeights[i] > 0) {
        const cycle = audioBeat / BEATS_PER_LOOP[i] + phase;
        action.time = (((cycle % 1) + 1) % 1) * action.getClip().duration;
      }
    }
    // Absolute audio phase drives the dance; zero delta only evaluates the private pose.
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
